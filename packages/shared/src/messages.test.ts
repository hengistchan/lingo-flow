import { success, failure, sendChromeMessage } from './messages'

describe("messages", () => {
  it("success wraps data in ok response", () => {
    const result = success({ id: 1, name: "test" })

    expect(result).toEqual({
      ok: true,
      data: { id: 1, name: "test" },
    })
  })

  it("failure wraps error in ok:false response", () => {
    const result = failure(new Error("something broke"))

    expect(result).toEqual({
      ok: false,
      error: { message: "something broke" },
    })
  })

  it("failure handles non-Error values", () => {
    const result = failure("string error")

    expect(result).toEqual({
      ok: false,
      error: { message: "string error" },
    })
  })

  it("sendChromeMessage returns data on success", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({
      ok: true,
      data: { translated: true },
    })
    vi.stubGlobal("chrome", { runtime: { sendMessage: sendMessageMock } })

    const result = await sendChromeMessage<{ translated: boolean }>({ action: "translate" })

    expect(result).toEqual({ translated: true })
    expect(sendMessageMock).toHaveBeenCalledWith({ action: "translate" })

    vi.unstubAllGlobals()
  })

  it("sendChromeMessage throws on failure response", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue({
      ok: false,
      error: { message: "connection lost" },
    })
    vi.stubGlobal("chrome", { runtime: { sendMessage: sendMessageMock } })

    await expect(sendChromeMessage({ action: "ping" })).rejects.toThrow("connection lost")

    vi.unstubAllGlobals()
  })

  it("sendChromeMessage throws on null response", async () => {
    const sendMessageMock = vi.fn().mockResolvedValue(null)
    vi.stubGlobal("chrome", { runtime: { sendMessage: sendMessageMock } })

    await expect(sendChromeMessage({ action: "ping" })).rejects.toThrow("Message failed")

    vi.unstubAllGlobals()
  })
})
