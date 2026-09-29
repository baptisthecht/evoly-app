import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Evoly",
};

export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-md">
				<div className="text-center mb-8">
					<a
						href="https://evoly.me"
						className="text-2xl font-bold text-violet-600 tracking-tight"
					>
						evoly
					</a>
				</div>
				{children}
			</div>
		</div>
	);
}
