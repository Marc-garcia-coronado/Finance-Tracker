import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button, Card, Field, Input } from '@/components/ui'
import { LoadingState } from '@/components/states'
import { useCrypto } from './CryptoProvider'

// Gate que se interpone entre la autenticación y las páginas con datos: nada
// con datos se renderiza hasta que el vault está desbloqueado.
export function VaultGate() {
  const { status } = useCrypto()

  if (status === 'unlocked') return <Outlet />

  let content: React.ReactNode
  if (status === 'setup') content = <SetupVault />
  else if (status === 'recovery') content = <RecoveryScreen />
  else if (status === 'locked') content = <UnlockVault />
  else content = <LoadingState />

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{content}</div>
    </div>
  )
}

function SetupVault() {
  const { setup, busy } = useCrypto()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pass.length < 8) return setError('Usa al menos 8 caracteres.')
    if (pass !== confirm) return setError('Las contraseñas no coinciden.')
    try {
      await setup(pass)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo configurar el cifrado')
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Protege tus datos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Elige una <strong>contraseña de cifrado</strong> (distinta de la de acceso). Con
          ella se cifran tus importes, conceptos y cuentas en tu dispositivo: el servidor
          nunca la recibe.
        </p>
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <Field label="Contraseña de cifrado" htmlFor="pass" error={error ?? undefined}>
          <Input
            id="pass"
            type="password"
            autoComplete="new-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </Field>
        <Field label="Repite la contraseña" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Si olvidas esta contraseña <strong>y</strong> el código de recuperación, tus
          datos cifrados no se podrán recuperar.
        </p>
        <Button type="submit" className="w-full" loading={busy}>
          Activar cifrado
        </Button>
      </form>
    </Card>
  )
}

function RecoveryScreen() {
  const { recoveryCode, acknowledgeRecovery } = useCrypto()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!recoveryCode) return
    try {
      await navigator.clipboard.writeText(recoveryCode)
      setCopied(true)
    } catch {
      // ignorar
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Código de recuperación</h1>
        <p className="mt-1 text-sm text-slate-600">
          Guárdalo en un lugar seguro. Es la <strong>única</strong> forma de recuperar tus
          datos si olvidas la contraseña de cifrado. No se vuelve a mostrar.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-base tracking-wider text-slate-900">
        {recoveryCode}
      </div>
      <Button type="button" variant="secondary" className="w-full" onClick={copy}>
        {copied ? 'Copiado ✓' : 'Copiar código'}
      </Button>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        He guardado el código de recuperación
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={acknowledgeRecovery}>
        Continuar
      </Button>
    </Card>
  )
}

function UnlockVault() {
  const { unlockPassphrase, unlockRecovery, busy } = useCrypto()
  const [mode, setMode] = useState<'pass' | 'recovery'>('pass')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (mode === 'pass') await unlockPassphrase(value)
      else await unlockRecovery(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desbloquear')
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Desbloquear datos</h1>
        <p className="mt-1 text-sm text-slate-600">
          {mode === 'pass'
            ? 'Introduce tu contraseña de cifrado para ver tus datos en este dispositivo.'
            : 'Introduce tu código de recuperación.'}
        </p>
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <Field
          label={mode === 'pass' ? 'Contraseña de cifrado' : 'Código de recuperación'}
          htmlFor="unlock"
          error={error ?? undefined}
        >
          <Input
            id="unlock"
            type={mode === 'pass' ? 'password' : 'text'}
            autoComplete={mode === 'pass' ? 'current-password' : 'off'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          Desbloquear
        </Button>
      </form>
      <button
        type="button"
        className="text-xs font-medium text-indigo-600 hover:underline"
        onClick={() => {
          setMode((m) => (m === 'pass' ? 'recovery' : 'pass'))
          setValue('')
          setError(null)
        }}
      >
        {mode === 'pass' ? 'Usar código de recuperación' : 'Usar contraseña'}
      </button>
    </Card>
  )
}
