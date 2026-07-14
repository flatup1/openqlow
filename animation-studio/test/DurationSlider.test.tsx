import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DurationSlider } from '../src/components/animation-studio/DurationSlider';

describe('DurationSlider', () => {
  it('shows the current value and emits changes', () => {
    const onChange = vi.fn();
    render(<DurationSlider value={5} onChange={onChange} />);
    expect(screen.getByText('5秒')).toBeInTheDocument();
    const slider = screen.getByLabelText('動画の長さ(秒)') as HTMLInputElement;
    expect(slider.min).toBe('2');
    expect(slider.max).toBe('10');
    fireEvent.change(slider, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith(8);
  });
});
