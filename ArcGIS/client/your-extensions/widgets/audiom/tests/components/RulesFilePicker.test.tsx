import { React } from 'jimu-core'
import { render, fireEvent, waitFor, act } from '@testing-library/react'
import RulesFilePicker from '../../src/setting/components/RulesFilePicker'
import { useRulesCatalog } from '../../src/setting/hooks/useRulesCatalog'

jest.mock('jimu-ui', () => {
  const { createJimuUiStubs } = require('../helpers/stubComponents')
  return createJimuUiStubs()
})

const url = 'https://audiom.example/rules/id/9.json?apiKey=pk_one'
const items = [{ id: 9, name: 'OSM', slug: 'osm', url }]
const response = (data = items) => ({ ok: true, json: async () => ({ data }) }) as Response

function Harness ({ apiKey = 'pk_one', baseUrl = 'https://audiom.example', onChange = jest.fn(), value = '' }) {
  const catalog = useRulesCatalog(baseUrl, apiKey)
  return <RulesFilePicker label="Rules file" value={value} onChange={onChange} catalog={catalog} />
}

describe('Rules file catalog selection', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('loads the catalog with the key and saves the selected URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(response())
    const onChange = jest.fn()
    const view = render(<Harness onChange={onChange} />)
    const option = await view.findByRole('option', { name: 'OSM (#9)' })
    expect(option.getAttribute('value')).toBe(url)
    expect(global.fetch).toHaveBeenCalledWith('https://audiom.example/api/rules', expect.objectContaining({ headers: { 'X-API-Key': 'pk_one' } }))
    fireEvent.change(view.getByRole('combobox', { name: 'Rules file' }), { target: { value: url } })
    expect(onChange).toHaveBeenCalledWith(url)
  })

  it('preserves a custom URL and permits manual edits when catalog loading fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 })
    const onChange = jest.fn()
    const view = render(<Harness value="https://custom.example/rules.json" onChange={onChange} />)
    await view.findByRole('alert')
    const input = view.getByRole('textbox', { name: 'Rules file URL' })
    expect((input as HTMLInputElement).value).toBe('https://custom.example/rules.json')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'https://custom.example/other.json' } })
    expect(onChange).toHaveBeenCalledWith('https://custom.example/other.json')
  })

  it('discards old-key responses and clears choices when the key is removed', async () => {
    let finishOld: (value: Response) => void = () => undefined
    global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockResolvedValueOnce(response([{ id: 10, name: 'New', slug: 'new', url: 'https://audiom.example/rules/id/10.json?apiKey=pk_two' }]))
    const view = render(<Harness />)
    view.rerender(<Harness apiKey="pk_two" />)
    await view.findByRole('option', { name: 'New (#10)' })
    await act(async () => { finishOld(response()) })
    expect(view.queryByRole('option', { name: 'OSM (#9)' })).toBeNull()
    view.rerender(<Harness apiKey="" />)
    expect(view.queryByRole('option', { name: 'New (#10)' })).toBeNull()
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('announces an empty catalog and reloads when the server changes', async () => {
    global.fetch = jest.fn().mockResolvedValue(response([]))
    const view = render(<Harness />)
    await view.findByText('No rules files are available for this API key.')
    view.rerender(<Harness baseUrl="https://other.example" />)
    await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('https://other.example/api/rules', expect.anything()))
  })
})
