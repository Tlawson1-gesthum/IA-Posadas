// Teléfonos en los registros (logs de Vercel): nunca completos (02 · T9). "5493764123434" → "+54 376 ***-**34".

/** Un teléfono, enmascarado: característica y los dos últimos números. */
export function enmascarar(tel: string): string {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (d.startsWith("549")) d = d.slice(3);
  else if (d.startsWith("54")) d = d.slice(2);
  d = d.replace(/^0/, "");
  if (d.length < 6) return "***";
  return `+54 ${d.slice(0, 3)} ***-**${d.slice(-2)}`;
}

/** Un texto de registro con los números largos (10 o más cifras: teléfonos, CUIT) enmascarados. */
export function sinTelefonos(texto: unknown): string {
  return String(texto ?? "").replace(/\+?\d[\d -]{8,}\d/g, (m) => {
    const d = m.replace(/\D/g, "");
    if (d.length < 10) return m;
    return d.length === 11 ? `CUIT ***${d.slice(-2)}` : enmascarar(m); // un teléfono tiene 10, 12 o 13 cifras; el CUIT, 11
  });
}
