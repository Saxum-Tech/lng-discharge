'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, Company, UserRole } from '@/lib/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Pencil, PowerOff, KeyRound, X } from 'lucide-react'

const ROLES: UserRole[] = ['superadmin', 'company_admin', 'viewer']
const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  company_admin: 'Company Admin',
  viewer: 'Viewer',
}

interface UserWithEmail extends Profile {
  email?: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithEmail[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<UserWithEmail | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [{ data: profiles }, { data: comps }] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, company:companies(id, name)')
        .order('created_at', { ascending: false }),
      supabase.from('companies').select('*').eq('is_active', true).order('name'),
    ])
    setUsers(profiles ?? [])
    setCompanies(comps ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function toggleActive(u: UserWithEmail) {
    await supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id)
    fetchData()
  }

  async function sendPasswordReset(u: UserWithEmail) {
    if (!u.email) return alert('No email address on record.')
    const { error } = await supabase.auth.resetPasswordForEmail(u.email)
    if (error) alert(error.message)
    else alert(`Password reset email sent to ${u.email}`)
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <Plus size={14} /> Invite user
        </Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Company</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{u.full_name ?? '—'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">
                      {(u.company as { name?: string } | null)?.name ?? '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditUser(u)
                            setShowModal(true)
                          }}
                          className="rounded p-1 text-gray-400 hover:text-indigo-600"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => sendPasswordReset(u)}
                          className="rounded p-1 text-gray-400 hover:text-indigo-600"
                          title="Send password reset"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className={`rounded p-1 ${
                            u.is_active
                              ? 'text-gray-400 hover:text-red-600'
                              : 'text-gray-400 hover:text-green-600'
                          }`}
                          title={u.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <PowerOff size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && editUser && (
        <EditUserModal
          user={editUser}
          companies={companies}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            fetchData()
          }}
        />
      )}

      {showInvite && (
        <InviteModal
          companies={companies}
          onClose={() => setShowInvite(false)}
          onSaved={() => {
            setShowInvite(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// ─── Edit user modal ────────────────────────────────────────────────────────

function EditUserModal({
  user,
  companies,
  onClose,
  onSaved,
}: {
  user: UserWithEmail
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [companyId, setCompanyId] = useState(user.company_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ role, company_id: companyId || null })
      .eq('id', user.id)
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Edit user</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">{user.full_name}</p>
        {error && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— None —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Invite modal ────────────────────────────────────────────────────────────

function InviteModal({
  companies,
  onClose,
  onSaved,
}: {
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      setSaving(false)
      setError('Your session has expired. Please sign in again.')
      return
    }

    const response = await fetch('/api/admin/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email,
        fullName,
        role,
        companyId: companyId || null,
      }),
    })

    const result = (await response.json()) as { error?: string }

    setSaving(false)
    if (!response.ok) setError(result.error ?? 'Failed to send invite.')
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Invite user</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {error && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">— None —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Send invite
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
