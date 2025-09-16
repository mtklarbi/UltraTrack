// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SemanticScaleCard from './SemanticScaleCard';

describe('SemanticScaleCard', () => {
  it('renders and matches snapshot', () => {
    const { container } = render(
      <SemanticScaleCard left="Intéressé" right="Pas intéressé" value={0} min={-3} max={3} onChange={() => {}} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('increments and decrements within bounds', () => {
    let value = 0;
    const onChange = (v: number) => (value = v);
    render(
      <SemanticScaleCard left="Low" right="High" value={value} min={-1} max={1} onChange={onChange} />
    );

    const incBtn = screen.getByRole('button', { name: /increase toward/i });
    const decBtn = screen.getByRole('button', { name: /decrease toward/i });

    fireEvent.click(incBtn);
    expect(value).toBe(1);
    // cannot exceed max
    fireEvent.click(incBtn);
    expect(value).toBe(1);

    fireEvent.click(decBtn);
    expect(value).toBe(0);
    fireEvent.click(decBtn);
    expect(value).toBe(-1);
    // cannot go below min
    fireEvent.click(decBtn);
    expect(value).toBe(-1);
  });

  it('supports keyboard arrows and home/end', () => {
    let value = 0;
    const onChange = (v: number) => (value = v);
    const { getByRole } = render(
      <SemanticScaleCard left="L" right="R" value={value} min={-3} max={3} onChange={onChange} />
    );

    const group = getByRole('group');
    group.focus();
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(value).toBe(1);
    fireEvent.keyDown(group, { key: 'End' });
    expect(value).toBe(3);
    fireEvent.keyDown(group, { key: 'Home' });
    expect(value).toBe(-3);
  });
});

