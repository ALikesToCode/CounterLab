import { z } from "zod";

// CounterLab ships a strict `script-src 'self'` policy. Disable Zod's optional
// object-schema JIT before application schemas load so validation never probes
// dynamic function construction in the browser.
z.config({ jitless: true });
