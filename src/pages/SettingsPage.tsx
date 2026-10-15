import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useLegalStore } from '@/store/legalStore'
import { generateContractCsvTemplate, parseContractCsv } from '@/lib/legal/csvContractImport'
import { BUSINESS_TYPE_LABELS } from '@/types/legal'

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const profile = useLegalStore((s) => s.profile)
  const counterparties = useLegalStore((s) => s.counterparties)
  const contracts = useLegalStore((s) => s.contracts)
  const importContractsFromCsv = useLegalStore((s) => s.importContractsFromCsv)
  const updateProfile = useLegalStore((s) => s.updateProfile)
  const reset = useLegalStore((s) => s.reset)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [companyNameDraft, setCompanyNameDraft] = useState(profile?.companyName ?? '')

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseContractCsv(text)
      setWarnings(parsed.warnings)
      if (parsed.rows.length > 0) {
        const result = importContractsFromCsv(parsed.rows)
        setImportSummary(
          `Импортировано договоров: ${result.importedCount}.` +
            (result.createdCounterparties.length > 0 ? ` Созданы новые контрагенты: ${result.createdCounterparties.join(', ')}.` : ''),
        )
      } else {
        setImportSummary(null)
      }
    }
    reader.readAsText(file)
  }

  function handleProfileSave() {
    if (!profile) return
    updateProfile({ companyName: companyNameDraft.trim() || profile.companyName, businessType: profile.businessType })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-50">Настройки</h1>
        <p className="text-sm text-ink-500 mt-1">Профиль компании и импорт договоров</p>
      </div>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Профиль компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-ink-500 mb-1">Сфера деятельности</div>
                <div className="text-ink-100">{BUSINESS_TYPE_LABELS[profile.businessType]}</div>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Контрагентов / договоров</div>
                <div className="text-ink-100">{counterparties.length} / {contracts.length}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64">
                <div className="text-xs text-ink-500 mb-1">Название компании</div>
                <Input value={companyNameDraft} onChange={(e) => setCompanyNameDraft(e.target.value)} />
              </div>
              <Button size="sm" onClick={handleProfileSave}>Сохранить</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Импорт договоров из CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-400">
            Колонки: Контрагент, Категория контрагента, Название договора, Тип, Дата начала, Дата окончания,
            Автопродление, Срок уведомления (дней), Сумма. Незнакомые контрагенты будут созданы автоматически.
            Это единственный канал загрузки данных в этой фазе продукта — у договорного учёта нет готового
            «CRM»-эквивалента для прямой интеграции.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" size="sm" onClick={() => downloadTextFile('ai-legal-contracts-template.csv', generateContractCsvTemplate())}>
              <Download className="size-4" /> Скачать шаблон
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" /> Загрузить CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = ''
              }}
            />
          </div>
          {importSummary && <p className="text-sm text-positive-500">{importSummary}</p>}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-warning-500/25 bg-warning-500/10 p-3.5 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-warning-500">
                  {w}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-negative-500/30">
        <CardHeader>
          <CardTitle>Опасная зона</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-400 mb-3">Полностью сбросить рабочее пространство и начать заново.</p>
          <Button variant="destructive" onClick={reset}>
            Сбросить всё
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
