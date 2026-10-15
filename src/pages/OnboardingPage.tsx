import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, Building2, Factory, HardHat, Laptop, ShoppingBag, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { BrandMark } from '@/components/icons/BrandMark'
import { useLegalStore } from '@/store/legalStore'
import { BUSINESS_TYPE_LABELS, type BusinessType } from '@/types/legal'

const BUSINESS_TYPE_ICONS: Record<BusinessType, typeof Building2> = {
  retail: ShoppingBag,
  manufacturing: Factory,
  services: Wrench,
  it: Laptop,
  construction: HardHat,
  other: Building2,
}

const BUSINESS_TYPES: BusinessType[] = ['retail', 'manufacturing', 'services', 'it', 'construction', 'other']

type Step = 'company' | 'businessType' | 'load'

export function OnboardingPage() {
  const navigate = useNavigate()
  const completeOnboarding = useLegalStore((s) => s.completeOnboarding)
  const loadDemo = useLegalStore((s) => s.loadDemo)

  const [step, setStep] = useState<Step>('company')
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)

  const steps: Step[] = ['company', 'businessType', 'load']
  const stepIndex = steps.indexOf(step)
  const progressPct = ((stepIndex + 1) / steps.length) * 100

  function handleSkipToDemo() {
    loadDemo()
    navigate('/app/dashboard')
  }

  function handleEmptyWorkspace() {
    completeOnboarding({
      companyName: companyName.trim() || 'Моя компания',
      businessType: businessType ?? 'other',
    })
    navigate('/app/settings')
  }

  return (
    <div className="min-h-screen bg-ink-950 flex flex-col">
      <header className="flex items-center justify-between px-4 lg:px-8 h-16 border-b border-ink-800">
        <div className="flex items-center gap-2">
          <BrandMark className="size-4 text-brand-400" />
          <span className="text-sm font-semibold text-ink-50">AI Юрист</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSkipToDemo}>
          Пропустить и открыть демо
        </Button>
      </header>

      <div className="max-w-xl w-full mx-auto flex-1 flex flex-col justify-center px-4 py-12">
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-ink-500 mb-2">
            <span>Шаг {stepIndex + 1} из {steps.length}</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <Progress value={progressPct} />
        </div>

        {step === 'company' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-50 mb-2">Расскажите о компании</h1>
            <p className="text-sm text-ink-400 mb-6">
              Понадобится для реестра договоров и дашборда — можно пропустить и посмотреть на демо-данных.
            </p>
            <Input autoFocus placeholder="Название компании" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <div className="flex items-center justify-end mt-8">
              <Button onClick={() => setStep('businessType')}>Далее</Button>
            </div>
          </>
        )}

        {step === 'businessType' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-50 mb-2">Чем занимается компания?</h1>
            <p className="text-sm text-ink-400 mb-6">Поможет точнее подобрать типовые риск-пункты и категории контрагентов.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {BUSINESS_TYPES.map((option) => {
                const Icon = BUSINESS_TYPE_ICONS[option]
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setBusinessType(option)}
                    className={`flex items-center gap-2.5 rounded-xl border px-4 py-3.5 text-left transition-colors ${
                      businessType === option ? 'border-brand-500 bg-brand-500/10' : 'border-ink-800 hover:bg-ink-900'
                    }`}
                  >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300 shrink-0">
                      <Icon className="size-4" />
                    </div>
                    <span className="text-sm font-medium text-ink-100">{BUSINESS_TYPE_LABELS[option]}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-8">
              <Button variant="ghost" onClick={() => setStep('company')}>Назад</Button>
              <Button onClick={() => setStep('load')} disabled={!businessType}>Далее</Button>
            </div>
          </>
        )}

        {step === 'load' && (
          <>
            <h1 className="text-2xl font-semibold text-ink-50 mb-2">Загрузите данные</h1>
            <p className="text-sm text-ink-400 mb-6">
              Начните с демо-портфеля договоров и контрагентов — или с пустого рабочего пространства и загрузите свои
              договоры через CSV в Настройках.
            </p>
            <div className="grid gap-2.5">
              <button
                type="button"
                onClick={handleSkipToDemo}
                className="flex items-start gap-3 rounded-xl border border-ink-800 hover:bg-ink-900 px-4 py-3.5 text-left transition-colors"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300 shrink-0">
                  <ClipboardCheck className="size-4" />
                </div>
                <span>
                  <span className="block text-sm font-medium text-ink-100">Демо-портфель</span>
                  <span className="block text-xs text-ink-500 mt-0.5">
                    12 контрагентов, ~28 договоров, готовые рекомендации — включая просроченный срок уведомления у «ТехноСнаб».
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={handleEmptyWorkspace}
                className="flex items-start gap-3 rounded-xl border border-ink-800 hover:bg-ink-900 px-4 py-3.5 text-left transition-colors"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-ink-800 text-ink-300 shrink-0">
                  <Building2 className="size-4" />
                </div>
                <span>
                  <span className="block text-sm font-medium text-ink-100">Пустое рабочее пространство</span>
                  <span className="block text-xs text-ink-500 mt-0.5">Заведите договоры вручную или загрузите свой CSV в Настройках.</span>
                </span>
              </button>
            </div>
            <div className="flex items-center justify-start mt-8">
              <Button variant="ghost" onClick={() => setStep('businessType')}>Назад</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
