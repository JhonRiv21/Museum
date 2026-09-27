// Authorship card: a museum wall label that appears once the visitor reaches
// the finale, and steps aside while an exhibit's own label is open.

const SHOW_FROM_T = 0.96;   // the gaze has turned to the finale by here
const HIDE_BELOW_T = 0.945; // a margin, so it does not flicker at the edge

export function bindCredits(card: HTMLElement) {
  let shown = false;
  return (t: number, state: string) => {
    const want = state === "rail" && (shown ? t >= HIDE_BELOW_T : t >= SHOW_FROM_T);
    if (want === shown) return;
    shown = want;
    card.classList.toggle("show", shown);
    card.setAttribute("aria-hidden", String(!shown));
  };
}
