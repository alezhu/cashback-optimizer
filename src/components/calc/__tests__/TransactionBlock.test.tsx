/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TransactionBlock from '../TransactionBlock';
import { fmt } from '../../../utils/format';
import type { TransactionResult } from '../../../types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TransactionBlock copy functionality', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
  });

  const mockTx: TransactionResult = {
    group: {
      id: 1,
      name: 'Коммуналка',
      active: true,
      commission: 0,
      roundCommission: false,
      minCommission: null,
      maxCommission: null,
      payments: [],
    },
    groupName: 'Коммуналка',
    payments: [
      {
        id: 101,
        name: 'Квартплата',
        active: true,
        amount: 1994.31,
        commissionOverride: null,
        roundCommissionOverride: null,
        minCommissionOverride: null,
        maxCommissionOverride: null,
        noIncrease: false,
      },
    ],
    adjustIdx: 0,
    enteredOriginal: 1994.31,
    billedSum: 1994.31,
    roundedSum: 2000,
    increaseEntered: 5.69,
    factBilledSum: 2000,
    cashback: 100,
  };

  it('copies formatted original amount with comma delimiter to clipboard', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<TransactionBlock tx={mockTx} index={0} />);
    });

    const origCopyBtn = container.querySelector('.pamount-cell .btn-copy') as HTMLButtonElement;
    expect(origCopyBtn).not.toBeNull();

    await act(async () => {
      origCopyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedValue = writeTextMock.mock.calls[0][0];
    // Must be formatted as displayed (with comma, not dot)
    expect(copiedValue).toBe(fmt(mockTx.payments[0].amount));
    expect(copiedValue).toContain(',');
    expect(copiedValue).not.toContain('.');
  });

  it('copies formatted adjusted amount with comma delimiter from adjustment row', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<TransactionBlock tx={mockTx} index={0} />);
    });

    expect(container.querySelector('.tx-adjust-row .padjust-prefix')?.textContent).toBe('ввести');

    const adjCopyBtn = container.querySelector('.tx-adjust-row .pamount .btn-copy') as HTMLButtonElement;
    expect(adjCopyBtn).not.toBeNull();

    await act(async () => {
      adjCopyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedValue = writeTextMock.mock.calls[0][0];
    const expectedAdjustedAmount = mockTx.payments[0].amount + mockTx.increaseEntered;
    expect(copiedValue).toBe(fmt(expectedAdjustedAmount));
    expect(copiedValue).toContain(',');
    expect(copiedValue).not.toContain('.');
  });

  it('displays compact commission with tooltip and copies formatted billed amount with commission', async () => {
    const txWithCommission: TransactionResult = {
      ...mockTx,
      group: {
        ...mockTx.group,
        commission: 1.5,
      },
      payments: [
        {
          ...mockTx.payments[0],
          amount: 1000,
        },
      ],
      increaseEntered: 100,
      factBilledSum: 1116.5,
    };

    root = createRoot(container);
    await act(async () => {
      root!.render(<TransactionBlock tx={txWithCommission} index={0} />);
    });

    // Check table headers exist
    expect(container.querySelector('.th-name')?.textContent).toBe('Платёж');
    expect(container.querySelector('.th-amount')?.textContent).toBe('Сумма');
    expect(container.querySelector('.th-rate')?.textContent).toBe('Комиссия');
    expect(container.querySelector('.th-billed')?.textContent).toBe('С комиссией');

    // Check commission block in main row: no word "комиссия" in text, no tooltip (since it is in the header)
    const prateVal = container.querySelector('.tx-has-adjust .prate .prate-val') as HTMLElement;
    expect(prateVal).not.toBeNull();
    expect(prateVal.textContent?.trim()).toBe('1.5% (15,00 ₽)');
    expect(prateVal.textContent).not.toContain('комиссия');
    expect(prateVal.getAttribute('title')).toBeNull();

    // Check billed cell in main row: right-aligned, 1000 + 1.5% = 1015.00
    const billedCell = container.querySelector('.tx-has-adjust .pbilled .pamount-val') as HTMLElement;
    expect(billedCell).not.toBeNull();
    expect(billedCell.textContent?.trim()).toBe('1\u00A0015,00 ₽');

    // Copy billed amount from main row
    const billedCopyBtn = container.querySelector('.tx-has-adjust .pbilled .btn-copy') as HTMLButtonElement;
    expect(billedCopyBtn).not.toBeNull();

    await act(async () => {
      billedCopyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith(fmt(1015));

    // Check adjustment sub-row: commission and billed amount from adjustment
    // Adjusted amount: 1000 + 100 = 1100. Commission: 1100 * 1.5% = 16.50. Billed: 1116.50
    const adjRateVal = container.querySelector('.tx-adjust-row .prate .prate-val') as HTMLElement;
    expect(adjRateVal.textContent?.trim()).toBe('1.5% (16,50 ₽)');

    const adjBilledCell = container.querySelector('.tx-adjust-row .pbilled .pamount-val') as HTMLElement;
    expect(adjBilledCell.textContent?.trim()).toBe('1\u00A0116,50 ₽');

    // Copy billed amount from adjustment row
    const adjBilledCopyBtn = container.querySelector('.tx-adjust-row .pbilled .btn-copy') as HTMLButtonElement;
    expect(adjBilledCopyBtn).not.toBeNull();

    await act(async () => {
      adjBilledCopyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith(fmt(1116.5));
  });
});
