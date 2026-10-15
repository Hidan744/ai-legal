import { describe, expect, it } from 'vitest'
import { generateContractCsvTemplate, parseContractCsv } from './csvContractImport'

describe('parseContractCsv', () => {
  it('parses a well-formed CSV with Russian headers', () => {
    const csv = [
      'Контрагент,Категория контрагента,Название договора,Тип,Дата начала,Дата окончания,Автопродление,Срок уведомления (дней),Сумма',
      'ООО Ромашка,Поставщик,Поставка бумаги,Поставка,2026-01-01,2026-12-31,Да,30,500000',
    ].join('\n')
    const result = parseContractCsv(csv)
    expect(result.warnings).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      counterpartyName: 'ООО Ромашка',
      counterpartyCategory: 'supplier',
      title: 'Поставка бумаги',
      type: 'supply',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      autoRenew: true,
      renewalNoticePeriodDays: 30,
      value: 500000,
    })
  })

  it('recognizes the generated template as valid input', () => {
    const result = parseContractCsv(generateContractCsvTemplate())
    expect(result.rows).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns and skips rows missing required fields', () => {
    const csv = ['Контрагент,Название договора', ',Без контрагента'].join('\n')
    const result = parseContractCsv(csv)
    expect(result.rows).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })

  it('defaults unknown contract type to "other" and unparsable value to 0', () => {
    const csv = ['Контрагент,Название договора,Тип,Сумма', 'ООО Тест,Договор X,Неизвестный тип,abc'].join('\n')
    const result = parseContractCsv(csv)
    expect(result.rows[0].type).toBe('other')
    expect(result.rows[0].value).toBe(0)
    expect(result.warnings.some((w) => w.includes('не распознана'))).toBe(true)
  })

  it('returns an error when required columns are missing', () => {
    const csv = ['Сумма,Тип', '500000,Поставка'].join('\n')
    const result = parseContractCsv(csv)
    expect(result.rows).toHaveLength(0)
    expect(result.warnings[0]).toContain('обязательные колонки')
  })
})
