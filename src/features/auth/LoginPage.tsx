import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button, Field, Input } from '@/components/ui'

const schema = z.object({
  email: z.string().email('Email no válido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type FormValues = z.infer<typeof schema>

type Mode = 'login' | 'register'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [serverError, setServerError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setServerError(null)
    setInfo(null)

    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp(values)
      if (error) return setServerError(error.message)
      if (!data.session) {
        // Confirmación por email activada en el proyecto.
        setInfo('Revisa tu correo para confirmar la cuenta y luego inicia sesión.')
        setMode('login')
        return
      }
      navigate('/', { replace: true })
      return
    }

    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) return setServerError(error.message)
    navigate('/', { replace: true })
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            €
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Finanzas personales</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              invalid={!!errors.email}
              {...register('email')}
            />
          </Field>

          <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              invalid={!!errors.password}
              {...register('password')}
            />
          </Field>

          {serverError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {serverError}
            </p>
          )}
          {info && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </p>
          )}

          <Button type="submit" loading={isSubmitting} className="w-full">
            {mode === 'login' ? 'Entrar' : 'Registrarme'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button
            type="button"
            className="font-semibold text-indigo-600 hover:underline"
            onClick={() => {
              setServerError(null)
              setInfo(null)
              setMode(mode === 'login' ? 'register' : 'login')
            }}
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </main>
  )
}
