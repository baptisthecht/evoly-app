import { Resend } from "resend";

let _resend: Resend | null = null;

export const resend = {
	emails: {
		send: (...args: Parameters<Resend["emails"]["send"]>) => {
			if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
			return _resend.emails.send(...args);
		},
	},
};

export const FROM_EMAIL = process.env.FROM_EMAIL ?? "Evoly <noreply@evoly.me>";
