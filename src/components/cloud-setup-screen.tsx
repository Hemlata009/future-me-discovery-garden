export function CloudSetupScreen({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section
        aria-labelledby="cloud-setup-title"
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Setup needed</p>
        <h1 id="cloud-setup-title" className="mt-2 text-2xl font-semibold text-foreground">
          The app can't reach its database yet
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This version was built without a required Lovable Cloud setting, so pages can't load.
        </p>
        <p className="mt-6 text-sm font-semibold text-foreground">Missing setting</p>
        <ul className="mt-2 space-y-1">
          {missing.map((name) => (
            <li key={name}>
              <code className="rounded bg-muted px-2 py-1 text-sm text-foreground">{name}</code>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm font-semibold text-foreground">How to fix it</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Open the project in Lovable and check that Lovable Cloud is enabled.</li>
          <li>If Cloud was disconnected, reconnect it so the setting is restored.</li>
          <li>Publish the app again so the new version includes the setting.</li>
          <li>Refresh this page once the new version is live.</li>
        </ol>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Refresh page
        </button>
      </section>
    </main>
  );
}
