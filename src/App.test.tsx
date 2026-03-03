import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders CogInstrument shell', () => {
  render(<App />);
  const brand = screen.getByText(/CogInstrument/i);
  expect(brand).toBeInTheDocument();
});
