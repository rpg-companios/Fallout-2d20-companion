import { describe, expect, it, vi } from 'vitest';

import SettingRuntimeBoundary from '../../components/SettingRuntimeBoundary';

describe('setting runtime boundary', () => {
  it('switches to the fallback after a render error', () => {
    expect(SettingRuntimeBoundary.getDerivedStateFromError(new Error('boom')))
      .toEqual({ failed: true });

    const instance = new SettingRuntimeBoundary({ fallback: null });
    instance.state = { failed: true };
    expect(instance.render()).toBeNull();
  });

  it('reports the crash upward and survives a broken handler', () => {
    const onError = vi.fn(() => { throw new Error('handler failed'); });
    const instance = new SettingRuntimeBoundary({ onError });
    const error = new Error('Object is not a function');

    expect(() => instance.componentDidCatch(error, { componentStack: 'at Screen' })).not.toThrow();
    expect(onError).toHaveBeenCalledWith({ error, info: { componentStack: 'at Screen' } });
  });
});
