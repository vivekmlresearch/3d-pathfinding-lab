# Benchmark: 20 random pairs per cube, 26 moves, 5% walls, cost 1-10, eps 1, seed 20261024
Node v22.23.4 on linux x64

## N = 8  (V = 512, 20 reachable pairs, mean 5 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 253 | 257 | 49.5% | 0.12 | 0.30 | 0.10 | 20/20 | 0.00 | 0.00 |
| A* | 142 | 125 | 27.8% | 0.06 | 0.19 | 0.08 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 87 | 88 | 17.1% | 0.06 | 1.06 | 1.16 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 53 | 48 | 10.4% | 0.07 | 0.97 | 1.87 | 20/20 | 0.00 | 0.00 |
| SPFA | 301 | 277 | 58.8% | 0.09 | 0.24 | 0.16 | 20/20 | 0.00 | 0.00 |
| Greedy | 6 | 5 | 1.1% | 0.03 | 0.06 | 0.02 | 1/20 | 68.37 | 117.75 |

## N = 16  (V = 4,096, 20 reachable pairs, mean 7 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 1,271 | 1,059 | 31.0% | 0.77 | 2.13 | 0.71 | 20/20 | 0.00 | 0.00 |
| A* | 421 | 295 | 10.3% | 0.31 | 0.91 | 0.29 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 321 | 299 | 7.8% | 0.40 | 0.85 | 0.23 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 142 | 153 | 3.5% | 0.38 | 0.65 | 0.19 | 20/20 | 0.00 | 0.00 |
| SPFA | 1,672 | 1,516 | 40.8% | 0.70 | 1.45 | 0.56 | 20/20 | 0.00 | 0.00 |
| Greedy | 8 | 8 | 0.2% | 0.12 | 0.25 | 0.11 | 1/20 | 81.64 | 205.09 |

## N = 24  (V = 13,824, 20 reachable pairs, mean 15 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 7,851 | 8,518 | 56.8% | 4.28 | 7.69 | 2.16 | 20/20 | 0.00 | 0.00 |
| A* | 2,936 | 2,790 | 21.2% | 1.70 | 3.41 | 1.26 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 2,555 | 2,523 | 18.5% | 1.25 | 3.38 | 1.15 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 1,225 | 1,051 | 8.9% | 0.86 | 2.33 | 0.94 | 20/20 | 0.00 | 0.00 |
| SPFA | 11,320 | 11,680 | 81.9% | 3.77 | 6.44 | 1.80 | 20/20 | 0.00 | 0.00 |
| Greedy | 15 | 14 | 0.1% | 0.10 | 0.20 | 0.08 | 0/20 | 116.08 | 203.79 |

## N = 32  (V = 32,768, 20 reachable pairs, mean 20 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 19,505 | 22,404 | 59.5% | 10.1 | 14.1 | 4.19 | 20/20 | 0.00 | 0.00 |
| A* | 7,471 | 7,354 | 22.8% | 2.97 | 5.74 | 2.09 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 5,992 | 5,795 | 18.3% | 2.74 | 4.67 | 1.46 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 2,456 | 1,927 | 7.5% | 1.41 | 2.98 | 0.98 | 20/20 | 0.00 | 0.00 |
| SPFA | 31,440 | 35,144 | 95.9% | 8.81 | 12.5 | 3.61 | 20/20 | 0.00 | 0.00 |
| Greedy | 19 | 21 | 0.1% | 0.09 | 0.11 | 0.01 | 0/20 | 119.66 | 186.73 |

## N = 40  (V = 64,000, 20 reachable pairs, mean 26 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 34,216 | 40,769 | 53.5% | 19.4 | 27.3 | 8.62 | 20/20 | 0.00 | 0.00 |
| A* | 12,800 | 12,153 | 20.0% | 5.44 | 15.2 | 4.33 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 11,678 | 13,754 | 18.2% | 6.06 | 11.1 | 3.80 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 4,422 | 4,512 | 6.9% | 3.21 | 8.00 | 2.18 | 20/20 | 0.00 | 0.00 |
| SPFA | 62,630 | 75,968 | 97.9% | 18.4 | 25.2 | 8.21 | 20/20 | 0.00 | 0.00 |
| Greedy | 25 | 27 | 0.0% | 0.16 | 0.38 | 0.07 | 0/20 | 148.54 | 275.06 |

## Empirical scaling, median time and mean expansions as a power of V

| Algorithm | alpha (expanded ~ V^alpha) | alpha (time ~ V^alpha) |
|---|---:|---:|
| Dijkstra | 1.06 | 1.07 |
| A* | 0.98 | 0.95 |
| Bi-Dijkstra | 1.06 | 0.93 |
| Bi-A* | 0.97 | 0.77 |
| SPFA | 1.14 | 1.11 |
| Greedy | 0.32 | 0.26 |

Times are single timed runs per pair (no repeats) after a JIT warm-up, so read medians, not single values.

wrote bench/results-26.json
