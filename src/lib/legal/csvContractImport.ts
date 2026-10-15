/**
 * Импорт договоров из CSV — тот же приём, что и у csvDealImport.ts в AI РОП / csvStockImport.ts
 * в AI COO (синонимы заголовков колонок, устойчивый разбор чисел и дат), но по одной строке
 * на договор. Это ручной, но реальный (не заглушка) канал получения данных в эту фазу продукта.
 */
import type { ContractType, CounterpartyCategory } from '@/types/legal'
import { CONTRACT_TYPE_LABELS, COUNTERPARTY_CATEGORY_LABELS } from '@/types/legal'

export interface CsvContractRow {
  counterpartyName: string
  counterpartyCategory: CounterpartyCategory
  title: string
  type: ContractType
  startDate: string
  endDate: string | null
  autoRenew: boolean
  renewalNoticePeriodDays: number
  value: number
}

export interface ContractImportResult {
  rows: CsvContractRow[]
  warnings: string[]
}

const HEADER_ALIASES = {
  counterpartyName: ['контрагент', 'counterparty', 'компания'],
  counterpartyCategory: ['категория контрагента', 'категория', 'category'],
  title: ['название договора', 'договор', 'название', 'title', 'contract'],
  type: ['тип', 'тип договора', 'type'],
  startDate: ['дата начала', 'начало', 'start', 'start date'],
  endDate: ['дата окончания', 'окончание', 'end', 'end date'],
  autoRenew: ['автопродление', 'автопролонгация', 'auto renew', 'autorenew'],
  renewalNoticePeriodDays: ['срок уведомления', 'срок уведомления (дней)', 'notice period', 'уведомление'],
  value: ['сумма', 'value', 'стоимость', 'сумма договора'],
} as const

type Field = keyof typeof HEADER_ALIASES

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseNumericCell(raw: string): number | null {
  const cleaned = (raw ?? '').replace(/[\s ]/g, '').replace(',', '.').replace(/[₽$€]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const TYPE_BY_LABEL = new Map<string, ContractType>(
  (Object.entries(CONTRACT_TYPE_LABELS) as [ContractType, string][]).map(([type, label]) => [label.toLowerCase(), type]),
)

function parseType(raw: string): ContractType {
  const v = raw.trim().toLowerCase()
  if (TYPE_BY_LABEL.has(v)) return TYPE_BY_LABEL.get(v) as ContractType
  if ((Object.keys(CONTRACT_TYPE_LABELS) as string[]).includes(v)) return v as ContractType
  return 'other'
}

const CATEGORY_BY_LABEL = new Map<string, CounterpartyCategory>(
  (Object.entries(COUNTERPARTY_CATEGORY_LABELS) as [CounterpartyCategory, string][]).map(([cat, label]) => [label.toLowerCase(), cat]),
)

function parseCategory(raw: string | undefined): CounterpartyCategory {
  if (!raw) return 'other'
  const v = raw.trim().toLowerCase()
  if (CATEGORY_BY_LABEL.has(v)) return CATEGORY_BY_LABEL.get(v) as CounterpartyCategory
  if ((Object.keys(COUNTERPARTY_CATEGORY_LABELS) as string[]).includes(v)) return v as CounterpartyCategory
  return 'other'
}

function parseBool(raw: string | undefined): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === 'да' || v === 'yes' || v === 'true' || v === '1'
}

/** Наивный CSV-парсер: одна ячейка = значение между запятыми, кавычки не поддерживаются
 *  (данные договоров — числа, даты и короткие названия, без запятых внутри значений). */
function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim())
}

export function parseContractCsv(csvText: string): ContractImportResult {
  const warnings: string[] = []
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)

  if (lines.length < 2) {
    return { rows: [], warnings: ['В файле нет строк с данными (нужны заголовок + хотя бы одна строка договора).'] }
  }

  const headerCells = splitCsvLine(lines[0]).map(normalizeHeader)
  const columnIndex: Partial<Record<Field, number>> = {}
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const idx = headerCells.findIndex((h) => (HEADER_ALIASES[field] as readonly string[]).includes(h))
    if (idx !== -1) columnIndex[field] = idx
  }

  if (columnIndex.counterpartyName === undefined || columnIndex.title === undefined) {
    return { rows: [], warnings: ['Не найдены обязательные колонки «Контрагент» и «Название договора».'] }
  }

  const rows: CsvContractRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const get = (field: Field) => (columnIndex[field] !== undefined ? cells[columnIndex[field] as number] : undefined)

    const counterpartyName = (get('counterpartyName') ?? '').trim()
    const title = (get('title') ?? '').trim()
    if (!counterpartyName || !title) {
      warnings.push(`Строка ${i + 1}: пропущена — не заполнены контрагент или название договора.`)
      continue
    }

    const rawValue = get('value')
    let value = 0
    if (rawValue !== undefined && rawValue !== '') {
      const parsed = parseNumericCell(rawValue)
      if (parsed === null) {
        warnings.push(`Строка ${i + 1}: сумма «${rawValue}» не распознана как число — заменена на 0.`)
      } else {
        value = Math.max(0, parsed)
      }
    }

    const rawNotice = get('renewalNoticePeriodDays')
    let renewalNoticePeriodDays = 30
    if (rawNotice !== undefined && rawNotice !== '') {
      const parsed = parseNumericCell(rawNotice)
      if (parsed !== null) renewalNoticePeriodDays = Math.max(0, Math.round(parsed))
    }

    const rawEndDate = (get('endDate') ?? '').trim()

    rows.push({
      counterpartyName,
      counterpartyCategory: parseCategory(get('counterpartyCategory')),
      title,
      type: parseType(get('type') ?? ''),
      startDate: (get('startDate') ?? '').trim() || new Date().toISOString().slice(0, 10),
      endDate: rawEndDate || null,
      autoRenew: parseBool(get('autoRenew')),
      renewalNoticePeriodDays,
      value,
    })
  }

  return { rows, warnings }
}

export function generateContractCsvTemplate(): string {
  const headers = [
    'Контрагент',
    'Категория контрагента',
    'Название договора',
    'Тип',
    'Дата начала',
    'Дата окончания',
    'Автопродление',
    'Срок уведомления (дней)',
    'Сумма',
  ]
  const example = [
    'ООО «Пример Снаб»',
    'Поставщик',
    'Поставка упаковочных материалов',
    'Поставка',
    '2026-01-15',
    '2027-01-15',
    'Да',
    '30',
    '850000',
  ]
  return [headers.join(','), example.join(',')].join('\n')
}
