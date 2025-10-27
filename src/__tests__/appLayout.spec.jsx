import { render, screen } from '@testing-library/react'

// Mock XLSX (App imports it)
vi.mock('xlsx', () => ({
  utils: { json_to_sheet: vi.fn(), book_new: vi.fn(), book_append_sheet: vi.fn() },
  read: vi.fn(() => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } })),
}))

import App from '../App.jsx'

test('app shell uses a wide container', () => {
  render(<App />)
  const shell = screen.getByTestId('app-shell')
  expect(shell).toBeInTheDocument()
  expect(shell.className).toContain('max-w-screen-2xl')
  expect(shell.className).not.toContain('max-w-6xl')
})