export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold text-white">Lien invalide</h1>
        <p className="text-gray-400 text-sm">
          Ce lien de scanner est invalide, expiré ou a été révoqué par l&apos;organisateur.
        </p>
        <p className="text-gray-500 text-xs">
          Contactez l&apos;organisateur pour obtenir un nouveau lien.
        </p>
      </div>
    </div>
  );
}
