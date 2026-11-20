import { useEffect, useRef } from 'react';

/** Con alguna ventana abierta, la página de detrás no se desplaza */
export const useBloquearFondo = (abierta: boolean) => {
  useEffect(() => {
    if (!abierta) return;
    document.body.classList.add('modal-abierto');
    return () => document.body.classList.remove('modal-abierto');
  }, [abierta]);
};

/** Esc cierra la ventana de encima. Se le pasan las funciones de cierre de abajo arriba; null = cerrada. */
export const useEscCierra = (...cierres: (null | (() => void))[]) => {
  const ref = useRef(cierres);
  ref.current = cierres;
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      const abierta = [...ref.current].reverse().find((c) => c);
      if (abierta) { ev.preventDefault(); abierta(); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);
};
