import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/svelte'
import DataTable from './DataTable.svelte'

const columns = [
  { key: 'kod', label: 'Kod' },
  { key: 'n', label: 'N', align: 'right' as const, sortable: true, fmt: (v: number) => v.toFixed(1) },
]
const rows = [{ kod: 'B', n: 2 }, { kod: 'A', n: 10 }, { kod: 'C', n: 5 }]

describe('DataTable', () => {
  it('renders rows with fmt applied', () => {
    const { getAllByRole } = render(DataTable, { props: { columns, rows } })
    expect(getAllByRole('row')).toHaveLength(4) // header + 3
    expect(document.body.textContent).toContain('2.0')
  })
  it('sorts on sortable header click', async () => {
    const { getByText, getAllByRole } = render(DataTable, { props: { columns, rows } })
    await fireEvent.click(getByText('N'))
    const firstDataRow = getAllByRole('row')[1].textContent!
    expect(firstDataRow).toContain('B') // n=2 en küçük, asc
    await fireEvent.click(getByText('N'))
    expect(getAllByRole('row')[1].textContent).toContain('A') // n=10, desc
  })
})
