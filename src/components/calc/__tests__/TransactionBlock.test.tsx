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

  it('copies formatted adjusted amount with comma delimiter to clipboard', async () => {
    root = createRoot(container);
    await act(async () => {
      root!.render(<TransactionBlock tx={mockTx} index={0} />);
    });

    const adjCopyBtn = container.querySelector('.padjust .btn-copy') as HTMLButtonElement;
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
});
