/*
 * IATA (2-letter) -> ICAO (3-letter) airline code lookup, used by
 * lib/flightTracker.js to turn a user-friendly flight number like "UA123"
 * (IATA) into the callsign form OpenSky actually reports ("UAL123", ICAO) -
 * OpenSky's states/all has no callsign filter, so the tracker fetches the
 * whole snapshot and matches callsigns locally (see flightTracker.js).
 *
 * Covers major/common passenger carriers only - not exhaustive. A flight
 * number whose airline isn't listed here still gets tried verbatim as a
 * fallback (see resolveCandidateCallsigns()), which works for anyone who
 * already types the ICAO form directly. Feel free to add more entries.
 */
module.exports = {
	AA: "AAL", UA: "UAL", DL: "DAL", WN: "SWA", AS: "ASA", B6: "JBU", F9: "FFT",
	NK: "NKS", G4: "AAY", HA: "HAL", AC: "ACA", WS: "WJA",

	BA: "BAW", VS: "VIR", LH: "DLH", LX: "SWR", OS: "AUA", SN: "BEL", AF: "AFR",
	KL: "KLM", IB: "IBE", TP: "TAP", AZ: "ITY", LO: "LOT", SK: "SAS", AY: "FIN",
	TK: "THY", EI: "EIN", FR: "RYR", U2: "EZY", W6: "WZZ", VY: "VLG", DY: "NAX",
	PC: "PGT", FI: "ICE", BT: "BTI", A3: "AEE", PS: "AUI", UX: "AEA", TU: "TAR",
	AT: "RAM", RJ: "RJA", ME: "MEA", LY: "ELY", OK: "CSA", RO: "ROT", JU: "ASL",
	OU: "CTN", FB: "LZB", HV: "TRA", DE: "CFG", X3: "TUI", EW: "EWG", SU: "AFL",
	S7: "SBI", U6: "SVR",

	EK: "UAE", EY: "ETD", QR: "QTR", SV: "SVA", GF: "GFA", MS: "MSR", ET: "ETH",
	KQ: "KQA", SA: "SAA", XY: "KNE", J2: "AHY", KC: "KZR", HY: "UZB",

	QF: "QFA", VA: "VOZ", NZ: "ANZ", JQ: "JST", SQ: "SIA", MH: "MAS", TG: "THA",
	GA: "GIA", CX: "CPA", JL: "JAL", NH: "ANA", OZ: "AAR", KE: "KAL", CI: "CAL",
	BR: "EVA", CA: "CCA", MU: "CES", CZ: "CSN", HU: "CHH", AI: "AIC", "6E": "IGO",
	SG: "SEJ", UK: "VTI", VN: "HVN", TR: "TGW", AK: "AXM", D7: "XAX", HX: "CRK",
	UO: "HKE", "3K": "JSA", FJ: "FJI", PR: "PAL", "5J": "CEB",

	AM: "AMX", AR: "ARG", LA: "LAN", AV: "AVA", CM: "CMP", G3: "GLO", AD: "AZU",
	VB: "VIV", Y4: "VOI",

	FX: "FDX", "5X": "UPS", CV: "CLX"
};
