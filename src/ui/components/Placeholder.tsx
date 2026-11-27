export function Placeholder({ title }: { title: string }) {
  return (
    <section aria-labelledby="ph-title">
      <h1 id="ph-title">{title}</h1>
      <p>Noch nicht gebaut.</p>
    </section>
  );
}
