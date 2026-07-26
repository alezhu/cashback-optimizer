// Форматирование денежных сумм в привычном для рубля виде: 1 234,56
export const fmt = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
