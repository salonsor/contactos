/** Anillo de progreso: el porcentaje en el centro y, debajo, un texto opcional */
export const Anillo = ({ pct, tam = 120, grosor = 12, texto, completo }: {
  pct: number; tam?: number; grosor?: number; texto?: string; completo?: boolean;
}) => {
  const r = (tam - grosor) / 2;
  const largo = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className={'anillo' + (completo ? ' completo' : '')} style={{ width: tam, height: tam }}>
      <svg viewBox={`0 0 ${tam} ${tam}`} width={tam} height={tam} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" className="anillo-fondo" strokeWidth={grosor} />
        {p > 0 && (
          <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" className="anillo-valor" strokeWidth={grosor} strokeLinecap="round"
            strokeDasharray={`${(largo * p) / 100} ${largo}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
        )}
      </svg>
      <div className="anillo-centro">
        <b style={{ fontSize: Math.round(tam / 4.6) }}>{p < 1 && p > 0 ? '<1' : Math.round(p)}%</b>
        {texto && <small>{texto}</small>}
      </div>
    </div>
  );
};
