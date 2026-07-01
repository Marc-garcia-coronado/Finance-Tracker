import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button, Card, Field, Select } from '@/components/ui'
import { ProgressBar } from '@/components/ProgressBar'
import { Money } from '@/components/Money'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { parseCsv } from '@/lib/csv'
import {
  buildImportRows,
  categoryAccountType,
  detectColumns,
  mappingKeyOf,
  markInFileDuplicates,
  normalizeText,
  type MappingKey,
  type ParsedRow,
} from '@/lib/importMovements'
import type { EntryKind } from '@/lib/entries'
import type { CreateEntryParams } from '@/lib/entries'
import {
  useAccounts,
  useImportMovements,
  useSaveAccount,
  type Account,
  type ImportResult,
} from '@/lib/queries'

type Step = 'upload' | 'map' | 'confirm' | 'result'

const NEW = '__new__'
const KIND_LABEL: Record<EntryKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Ahorro / Traspaso',
}

// Estado de mapeo por clave (Tipo+Categoría) original.
type Mapping = { kind: EntryKind | ''; accountId: string } // accountId: '' | id | NEW

export function ImportMovementsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const accounts = useAccounts()
  const saveAccount = useSaveAccount()
  const importMutation = useImportMovements()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mappingKeys, setMappingKeys] = useState<MappingKey[]>([])
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set())
  const [mapping, setMapping] = useState<Record<string, Mapping>>({})
  const [principalId, setPrincipalId] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)

  const active = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.is_archived),
    [accounts.data],
  )
  const assets = useMemo(() => active.filter((a) => a.type === 'asset'), [active])

  function reset() {
    setStep('upload')
    setFileName('')
    setParseError(null)
    setRows([])
    setMappingKeys([])
    setDuplicates(new Set())
    setMapping({})
    setProgress(0)
    setResult(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function onFile(file: File) {
    setParseError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      const cols = detectColumns(parsed.headers)
      if (!cols) {
        setParseError(
          'No se reconocen las columnas. Se necesitan al menos «Fecha», «Tipo» e «Importe».',
        )
        return
      }
      const { rows: built, mappingKeys: keys } = buildImportRows(parsed, cols)
      const { duplicateIndexes } = markInFileDuplicates(built)

      // Auto-emparejado por nombre + kind inferido.
      const initial: Record<string, Mapping> = {}
      for (const k of keys) {
        const kind = k.kind ?? ''
        let accountId = ''
        if (kind) {
          const wanted = categoryAccountType(kind)
          const match = active.find(
            (a) => a.type === wanted && normalizeText(a.name) === normalizeText(k.categoria),
          )
          accountId = match?.id ?? ''
        }
        initial[k.key] = { kind, accountId }
      }
      setFileName(file.name)
      setRows(built)
      setMappingKeys(keys)
      setDuplicates(duplicateIndexes)
      setMapping(initial)
      setPrincipalId(
        assets.find((a) => normalizeText(a.name) === 'cuenta corriente')?.id ??
          assets[0]?.id ??
          '',
      )
      setStep('map')
    } catch {
      setParseError('No se pudo leer el archivo.')
    }
  }

  // ¿Está todo el mapeo resuelto?
  const mappingComplete =
    !!principalId &&
    mappingKeys.every((k) => {
      const m = mapping[k.key]
      return !!m && !!m.kind && (m.accountId === NEW || !!m.accountId)
    })

  const validRows = rows.filter((r) => !r.error && !duplicates.has(r.rawIndex))
  const errorCount = rows.filter((r) => r.error).length

  function updateMapping(key: string, patch: Partial<Mapping>) {
    setMapping((prev) => {
      const cur = prev[key] ?? { kind: '', accountId: '' }
      const next = { ...cur, ...patch }
      // Si cambia el kind, el tipo de cuenta requerido cambia: limpia selección
      // de cuenta si ya no es válida.
      if (patch.kind !== undefined && patch.kind !== cur.kind) next.accountId = ''
      return { ...prev, [key]: next }
    })
  }

  // Resuelve las filas válidas a CreateEntryParams usando el mapeo + cuentas
  // nuevas ya creadas (newIds: key -> accountId).
  function resolveEntries(newIds: Record<string, string>): {
    entries: CreateEntryParams[]
    unresolved: number
  } {
    const entries: CreateEntryParams[] = []
    let unresolved = 0
    for (const r of validRows) {
      const key = mappingKeyOf(r.kindGuess, r.categoria)
      const m = mapping[key]
      if (!m || !m.kind || r.dateISO === null || r.amountCents === null) {
        unresolved++
        continue
      }
      const categoryId = m.accountId === NEW ? newIds[key] : m.accountId
      if (!categoryId || !principalId || categoryId === principalId) {
        unresolved++
        continue
      }
      const isIncome = m.kind === 'income'
      entries.push({
        kind: m.kind,
        date: r.dateISO,
        description: r.concepto,
        fromAccountId: isIncome ? categoryId : principalId,
        toAccountId: isIncome ? principalId : categoryId,
        amountCents: r.amountCents,
      })
    }
    return { entries, unresolved }
  }

  async function onImport() {
    // 1) Crear las cuentas nuevas necesarias y recoger sus ids por clave.
    // accounts.name tiene una restricción UNIQUE (user_id, name): si ya existe
    // una cuenta con ese nombre (de cualquier tipo, incluso archivada) la
    // reutilizamos en vez de intentar crearla (evita el 409 Conflict).
    const byName = new Map(
      (accounts.data ?? []).map((a) => [normalizeText(a.name), a.id]),
    )
    const newIds: Record<string, string> = {}
    try {
      for (const k of mappingKeys) {
        const m = mapping[k.key]
        if (!m || m.accountId !== NEW || !m.kind) continue
        const nameKey = normalizeText(k.categoria)
        const existing = byName.get(nameKey)
        if (existing) {
          newIds[k.key] = existing
          continue
        }
        const id = (await saveAccount.mutateAsync({
          name: k.categoria.trim(),
          type: categoryAccountType(m.kind),
          is_budget_bucket: false,
        })) as string
        newIds[k.key] = id
        byName.set(nameKey, id) // por si otra clave repite el mismo nombre
      }
    } catch (e) {
      setParseError(
        'No se pudieron crear las cuentas nuevas: ' +
          (e instanceof Error ? e.message : 'error'),
      )
      return
    }

    // 2) Resolver e importar.
    const { entries } = resolveEntries(newIds)
    setStep('result')
    setProgress(0)
    const res = await importMutation.mutateAsync({
      entries,
      onProgress: (done, total) => setProgress(total ? done / total : 1),
    })
    setResult(res)
  }

  const title =
    step === 'upload'
      ? 'Importar movimientos'
      : step === 'map'
        ? 'Asignar categorías'
        : step === 'confirm'
          ? 'Revisar e importar'
          : 'Resultado de la importación'

  return (
    <Modal open={open} onClose={close} title={title}>
      {step === 'upload' && (
        <UploadStep fileName={fileName} error={parseError} onFile={onFile} />
      )}

      {step === 'map' && (
        <MapStep
          mappingKeys={mappingKeys}
          mapping={mapping}
          active={active}
          assets={assets}
          principalId={principalId}
          setPrincipalId={setPrincipalId}
          updateMapping={updateMapping}
          rowCount={rows.length}
          errorCount={errorCount}
          duplicateCount={duplicates.size}
          canContinue={mappingComplete}
          onBack={() => setStep('upload')}
          onContinue={() => setStep('confirm')}
        />
      )}

      {step === 'confirm' && (
        <ConfirmStep
          rows={rows}
          duplicates={duplicates}
          validCount={validRows.length}
          errorCount={errorCount}
          onBack={() => setStep('map')}
          onImport={onImport}
          busy={saveAccount.isPending}
        />
      )}

      {step === 'result' && (
        <ResultStep
          progress={progress}
          result={result}
          busy={importMutation.isPending}
          onClose={close}
        />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Paso 1: subir archivo
// ---------------------------------------------------------------------------
function UploadStep({
  fileName,
  error,
  onFile,
}: {
  fileName: string
  error: string | null
  onFile: (file: File) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Sube un archivo <strong>CSV</strong> con columnas{' '}
        <em>Fecha, Tipo, Categoría, Concepto, Importe</em>. Si tu Excel usa{' '}
        <code>;</code> como separador (lo habitual en español), también funciona.
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-indigo-400">
        <span className="text-sm font-medium text-slate-700">
          {fileName || 'Selecciona un archivo CSV'}
        </span>
        <span className="text-xs text-slate-500">Toca para elegir</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </label>

      <button
        type="button"
        onClick={downloadTemplate}
        className="text-xs font-medium text-indigo-600 hover:underline"
      >
        Descargar plantilla CSV
      </button>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function downloadTemplate() {
  const content =
    'Fecha;Tipo;Categoría;Concepto;Importe (€);Mes;Año\n' +
    '01/01/2026;Gasto;Ocio;Cine;12,50;Enero;2026\n' +
    '05/01/2026;Ingreso;Trabajo;Nómina;1800,00;Enero;2026\n' +
    '10/01/2026;Ahorro;Fondo emergencia;Traspaso mensual;200,00;Enero;2026\n'
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-movimientos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Paso 2: mapear categorías
// ---------------------------------------------------------------------------
function MapStep({
  mappingKeys,
  mapping,
  active,
  assets,
  principalId,
  setPrincipalId,
  updateMapping,
  rowCount,
  errorCount,
  duplicateCount,
  canContinue,
  onBack,
  onContinue,
}: {
  mappingKeys: MappingKey[]
  mapping: Record<string, Mapping>
  active: Account[]
  assets: Account[]
  principalId: string
  setPrincipalId: (id: string) => void
  updateMapping: (key: string, patch: Partial<Mapping>) => void
  rowCount: number
  errorCount: number
  duplicateCount: number
  canContinue: boolean
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {rowCount} fila(s) · {errorCount} con error · {duplicateCount} duplicada(s)
      </p>

      <Field label="Cuenta principal (eje de los movimientos)" htmlFor="principal">
        <Select
          id="principal"
          value={principalId}
          onChange={(e) => setPrincipalId(e.target.value)}
        >
          {assets.length === 0 && <option value="">No hay cuentas de activo</option>}
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="space-y-3">
        {mappingKeys.map((k) => {
          const m = mapping[k.key] ?? { kind: '', accountId: '' }
          const wanted = m.kind ? categoryAccountType(m.kind) : null
          const options = wanted ? active.filter((a) => a.type === wanted) : []
          return (
            <Card key={k.key} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-800">{k.categoria}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {k.tipoRaw || '—'} · {k.count}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  aria-label="Tipo de movimiento"
                  value={m.kind}
                  onChange={(e) =>
                    updateMapping(k.key, { kind: e.target.value as EntryKind | '' })
                  }
                  invalid={!m.kind}
                >
                  <option value="">Tipo…</option>
                  <option value="income">{KIND_LABEL.income}</option>
                  <option value="expense">{KIND_LABEL.expense}</option>
                  <option value="transfer">{KIND_LABEL.transfer}</option>
                </Select>
                <Select
                  aria-label="Cuenta destino"
                  value={m.accountId}
                  disabled={!m.kind}
                  onChange={(e) => updateMapping(k.key, { accountId: e.target.value })}
                  invalid={!!m.kind && !m.accountId}
                >
                  <option value="">Cuenta…</option>
                  {options.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                  <option value={NEW}>➕ Crear «{k.categoria}»</option>
                </Select>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" disabled={!canContinue} onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 3: previsualizar y confirmar
// ---------------------------------------------------------------------------
function ConfirmStep({
  rows,
  duplicates,
  validCount,
  errorCount,
  onBack,
  onImport,
  busy,
}: {
  rows: ParsedRow[]
  duplicates: Set<number>
  validCount: number
  errorCount: number
  onBack: () => void
  onImport: () => void
  busy: boolean
}) {
  const preview = rows.filter((r) => !r.error && !duplicates.has(r.rawIndex)).slice(0, 8)
  const errors = rows.filter((r) => r.error).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Summary label="A importar" value={validCount} tone="emerald" />
        <Summary label="Con error" value={errorCount} tone="rose" />
        <Summary label="Duplicadas" value={duplicates.size} tone="slate" />
      </div>

      {preview.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {preview.map((r) => (
            <div key={r.rawIndex} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">
                  {r.concepto || '(sin concepto)'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {r.dateISO ? formatDate(r.dateISO) : '—'} · {r.tipoRaw} · {r.categoria}
                </p>
              </div>
              <Money cents={r.amountCents ?? 0} className="shrink-0 font-semibold" />
            </div>
          ))}
          {validCount > preview.length && (
            <p className="px-3 py-2 text-xs text-slate-400">
              … y {validCount - preview.length} más
            </p>
          )}
        </Card>
      )}

      {errors.length > 0 && (
        <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          <p className="mb-1 font-medium">Filas que se omitirán:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {errors.map((r) => (
              <li key={r.rawIndex}>
                Fila {r.rawIndex + 2}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
          Atrás
        </Button>
        <Button type="button" onClick={onImport} loading={busy} disabled={validCount === 0}>
          Importar {validCount}
        </Button>
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'emerald' | 'rose' | 'slate'
}) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-100 text-slate-600',
  }[tone]
  return (
    <div className={cn('rounded-lg px-2 py-3', toneClass)}>
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paso 4: progreso y resultado
// ---------------------------------------------------------------------------
function ResultStep({
  progress,
  result,
  busy,
  onClose,
}: {
  progress: number
  result: ImportResult | null
  busy: boolean
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      {busy || !result ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Importando movimientos…</p>
          <ProgressBar value={progress} />
          <p className="text-right text-xs text-slate-400">{Math.round(progress * 100)}%</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Se crearon <strong>{result.created}</strong> movimiento(s).
            {result.failed.length > 0 && (
              <> {result.failed.length} fallaron.</>
            )}
          </p>
          {result.failed.length > 0 && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
              <ul className="list-disc space-y-0.5 pl-4">
                {result.failed.slice(0, 8).map((f) => (
                  <li key={f.index}>
                    {f.description || '(sin concepto)'}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
