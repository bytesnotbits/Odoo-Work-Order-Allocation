describe('reel footage & overlap rules', () => {
  test('footage calc 5000/3000 -> 2000', () => {
    const footage = Math.abs(5000 - 3000)
    expect(footage).toBe(2000)
  })

  const overlaps = (a, b) => Math.min(a[1], b[1]) > Math.max(a[0], b[0])

  test('touching endpoints is NOT overlap', () => {
    expect(overlaps([0, 10], [10, 20])).toBe(false)
  })

  test('true overlap detection', () => {
    expect(overlaps([0, 10], [9, 12])).toBe(true)
  })

  test('sorted detection finds conflict', () => {
    const intervals = [[0,10],[10,20],[9,12]].sort((x,y)=> x[0]-y[0] || x[1]-y[1])
    let hit = false
    for (let i=1;i<intervals.length;i++) if (intervals[i][0] < intervals[i-1][1]) { hit = true; break }
    expect(hit).toBe(true)
  })
})