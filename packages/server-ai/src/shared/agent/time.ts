
export function commonTimes() {
	const currentDate = new Date()

	// Get the current year
	const currentYear = currentDate.getFullYear()

	// Get the current month (starts from 0, so add 1)
	const currentMonth = currentDate.getMonth() + 1

	// Get the current day
	const currentDay = currentDate.getDate()

	// Calculate last year and the year before last
	const lastYear = currentYear - 1
	const yearBeforeLast = currentYear - 2

	// Calculate last month (need to check if the current month is January, if so, go back to December of the previous year)
	let lastMonth = currentMonth - 1
	let lastMonthYear = currentYear
	if (lastMonth === 0) {
		lastMonth = 12
		lastMonthYear -= 1
	}

	// Format the date as 2025-01
	const lastMonthFormatted = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`

	// Generate common relative times
	const relativeTimes = {
		'This Year': currentYear,
		'Last Year': lastYear,
		'The Year Before Last': yearBeforeLast,
		'Last Month': lastMonthFormatted,
		Today: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
	}

	return Object.keys(relativeTimes)
		.map((time) => `${time}: ${relativeTimes[time]}`)
		.join('; ')
}
