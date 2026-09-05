import { useEffect, useState } from 'react'
import GymApp from './GymApp'
import { bookingApi, resetSessionExpiredNotice, setSessionExpiredListener } from './api'
import { LanguageSwitch, useLang } from './i18n'
import { ThemeSwitch } from './theme'
import { Field } from './ui'
import { unlockNotificationSound } from './notificationSound'
import './App.css'
import './design-system.css'

export default function App() {
	const { t } = useLang()
	const [user, setUser] = useState<Awaited<ReturnType<typeof bookingApi.me>> | null>(null)
	const [busy, setBusy] = useState(true)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState('')
	const [form, setForm] = useState({ username: '', password: '' })

	useEffect(() => {
		setSessionExpiredListener(() => setUser(null))
		return () => setSessionExpiredListener(null)
	}, [])
	useEffect(() => {
		if (user) resetSessionExpiredNotice()
	}, [user])
	useEffect(() => { bookingApi.me().then(setUser).catch(() => undefined).finally(() => setBusy(false)) }, [])
	if (busy) {
		return (
			<div className="auth-page">
				<section className="auth-card auth-loading-card">
					<span className="brand-mark">F</span>
					<h1>{t('auth.loading')}</h1>
					<div className="auth-spinner" aria-hidden="true" />
				</section>
			</div>
		)
	}
	if (user) return <GymApp currentUser={user} onLogout={() => setUser(null)} onUserUpdated={setUser} />

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		unlockNotificationSound()
		setError('')
		setSubmitting(true)
		try {
			const nextUser = await bookingApi.login(form)
			setUser(nextUser)
		} catch (e) {
			setError(e instanceof Error ? e.message : t('auth.failed'))
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="auth-page">
			<section className="auth-card">
				<div className="auth-brand">
					<span className="brand-mark">F</span>
					<div>
						<strong>FlexOper</strong>
						<small>{t('brand.tag')}</small>
					</div>
				</div>
				<div className="auth-lang">
					<ThemeSwitch />
					<LanguageSwitch />
				</div>
				<span className="eyebrow">{t('brand.workspace')}</span>
				<h1>{t('auth.welcome')}</h1>
				<p>{t('auth.intro')}</p>
				{error && <div className="error auth-error">{error}</div>}
				<form onSubmit={submit}>
					<Field label={t('auth.username')}>
						<input required autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} />
					</Field>
					<Field label={t('auth.password')}>
						<input type="password" required autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />
					</Field>
					<button className="primary auth-submit" type="submit" disabled={submitting}>
						{submitting ? t('auth.signingIn') : t('auth.signIn')}
					</button>
				</form>
			</section>
		</div>
	)
}
