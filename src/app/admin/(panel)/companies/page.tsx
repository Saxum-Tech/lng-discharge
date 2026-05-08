'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company, CompanyType, CreateCompanyPayload } from '@/lib/types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Plus, Pencil, PowerOff, X } from 'lucide-react'

const COMPANY_TYPES: CompanyType[] = [
  'Shipper',
  'Terminal Operator',
  'Port Authority',
  'Customs',
  'Agent',
  'Other',
]

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Company | null>(null)

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('companies').select('*').order('name')
    setCompanies(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function toggleActive(company: Company) {
    await supabase
      .from('companies')
      .update({ is_active: !company.is_active })
      .eq('id', company.id)
    fetchData()
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <Button
          size="sm"
          onClick={() => {
            setEditItem(null)
            setShowModal(true)
          }}
        >
          <Plus size={14} /> Add company
        </Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-900">{c.name}</td>
                  <td className="py-3 pr-4 text-gray-600">{c.type}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditItem(c)
                          setShowModal(true)
                        }}
                        className="rounded p-1 text-gray-400 hover:text-indigo-600"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className={`rounded p-1 ${
                          c.is_active
                            ? 'text-gray-400 hover:text-red-600'
                            : 'text-gray-400 hover:text-green-600'
                        }`}
                        title={c.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <PowerOff size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showModal && (
        <CompanyModal
          editItem={editItem}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function CompanyModal({
  editItem,
  onClose,
  onSaved,
}: {
  editItem: Company | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(editItem?.name ?? '')
  const [type, setType] = useState<CompanyType>((editItem?.type as CompanyType) ?? 'Other')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload: CreateCompanyPayload = { name, type, is_active: true }
    if (editItem) {
      const { error } = await supabase.from('companies').update(payload).eq('id', editItem.id)
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('companies').insert(payload)
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editItem ? 'Edit company' : 'Add company'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {error && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CompanyType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
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
