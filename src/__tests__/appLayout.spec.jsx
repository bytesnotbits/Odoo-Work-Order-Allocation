import { render, screen } from '@testing-library/react'

import App from '../App.jsx'

test('app shell uses a wide container', () => {
  render(<App />)
  const shell = screen.getByTestId('app-shell')
  expect(shell).toBeInTheDocument()
  expect(shell.className).toContain('max-w-screen-2xl')
  expect(shell.className).not.toContain('max-w-6xl')
})
