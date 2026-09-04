import { useEffect, useState } from 'react'
import GymApp from './GymApp'
import { bookingApi } from './api'
import { LanguageSwitch, useLang } from './i18n'
import { ThemeSwitch } from './theme'
import './App.css'

export default function App() {
	const { t } = useLang()
	const [user, setUser] = useState<Awaited<ReturnType<typeof bookingApi.me>> | null>(null)
	const [busy, setBusy] = useState(true)
	const [error, setError] = useState('')
	const [form, setForm] = useState({ username: '', password: '' })

	useEffect(() => { bookingApi.me().then(setUser).catch(() => undefined).finally(() => setBusy(false)) }, [])
	if (busy) return <div className="auth-page"><section className="auth-card"><span className="eyebrow">FlexOper</span><h1>{t('auth.loading')}</h1></section></div>
	if (user) return <GymApp currentUser={user} onLogout={() => setUser(null)} />

	const submit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError('')
		try {
			const nextUser = await bookingApi.login(form)
			setUser(nextUser)
		} catch (e) {
			setError(e instanceof Error ? e.message : t('auth.failed'))
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
					<label>{t('auth.username')}<input required autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label>
					<label>{t('auth.password')}<input type="password" required autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
					<button className="primary auth-submit" type="submit">{t('auth.signIn')}</button>
				</form>
			</section>
		</div>
	)
}
