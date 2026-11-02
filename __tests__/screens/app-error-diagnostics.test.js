import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App Error diagnostics', () => {
  it('renders the React component stack with the caught error', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'index.js'), 'utf8');
    expect(source).toContain('info?.componentStack');
    expect(source).toContain('this.state.componentStack || this.state.errorStack');
    expect(source).toContain('<ScrollView');
    expect(source).toContain('selectable');
  });
});
