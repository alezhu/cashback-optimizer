// Форматирование денежных сумм в привычном для рубля виде: 1 234,56
export const fmt = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Форматирование суммы для копирования в буфер обмена (с запятой, но без пробелов-разделителей разрядов): 1234,56
export const fmtClipboard = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2).replace('.', ',');
