function serialize(responderPayload, { shape = 'api' } = {}) {
  return {
    title: responderPayload.title,
    summary: responderPayload.summary,
    bullets: responderPayload.bullets,
    cta: responderPayload.cta || null,
    raw: responderPayload.raw
  };
}

module.exports = { serialize };
