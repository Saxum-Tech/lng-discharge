'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ProfilePage() {
  const { profile, user } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('user_id', user!.id)
    setSaving(false)
    if (error) setError(error.message)
    else setMessage('Profile updated.')
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) setError(error.message)
    else {
      setMessage('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
    }
  }

  const roleLabel: Record<string, string> = {
    superadmin: 'Super Admin',
    company_admin: 'Company Admin',
    viewer: 'Viewer',
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">My Profile</h1>

      <div className="space-y-6">
        {/* Account info (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <dl className="divide-y divide-gray-100 text-sm">
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Role</dt>
              <dd className="font-medium text-gray-900">
                {roleLabel[profile?.role ?? 'viewer']}
              </dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-gray-500">Company</dt>
              <dd className="font-medium text-gray-900">
                {(profile?.company as { name?: string } | null)?.name ?? '—'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Edit display name */}
        <Card>
          <CardHeader>
            <CardTitle>Display name</CardTitle>
          </CardHeader>
          <form onSubmit={handleProfileSave} className="space-y-3">
            <Input
              label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {message && <p className="text-sm text-green-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" loading={saving} size="sm">
              Save
            </Button>
          </form>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button type="submit" loading={saving} size="sm">
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
