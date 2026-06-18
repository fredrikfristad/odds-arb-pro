export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    service: "odds-arb-pro-api",
    time: new Date().toISOString(),
  });
}
