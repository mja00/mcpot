/**
 * Runtime reads of the Tailwind @theme tokens for ECharts, which can't consume CSS variables in
 * its option object. The theme block is declared `static` so these variables always exist in the
 * built CSS even when no utility references them.
 */
export function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface ChartTheme {
	status: string;
	login: string;
	accent: string;
	ink: string;
	grid: string;
	fontFamily: string;
	palette: string[];
}

export function chartTheme(): ChartTheme {
	const value = (name: string) => cssVar(name);
	return {
		status: cssVar("--color-series-status"),
		login: cssVar("--color-series-login"),
		accent: cssVar("--color-accent"),
		ink: cssVar("--color-ink-secondary"),
		grid: cssVar("--color-grid"),
		fontFamily: cssVar("--font-sans"),
		palette: [
			value("--color-series-status"),
			value("--color-series-login"),
			value("--color-series-teal"),
			value("--color-series-violet"),
			value("--color-series-rose"),
			value("--color-series-lime"),
			value("--color-series-cyan"),
			value("--color-series-slate"),
		],
	};
}
