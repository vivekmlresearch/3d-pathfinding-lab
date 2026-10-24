# Benchmark: 20 random pairs per cube, 6 moves, 5% walls, cost 1-10, eps 1, seed 20261024
Node v22.23.4 on linux x64

## N = 8  (V = 512, 20 reachable pairs, mean 10 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 273 | 282 | 53.4% | 0.07 | 0.12 | 0.03 | 20/20 | 0.00 | 0.00 |
| A* | 191 | 162 | 37.3% | 0.05 | 0.12 | 0.03 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 133 | 141 | 26.0% | 0.16 | 0.27 | 0.09 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 100 | 100 | 19.5% | 0.12 | 0.34 | 0.10 | 20/20 | 0.00 | 0.00 |
| SPFA | 333 | 339 | 65.1% | 0.05 | 0.09 | 0.02 | 20/20 | 0.00 | 0.00 |
| Greedy | 10 | 10 | 2.0% | 0.02 | 4.22 | 1.76 | 0/20 | 41.59 | 100.35 |

## N = 16  (V = 4,096, 20 reachable pairs, mean 14 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 1,379 | 1,236 | 33.7% | 0.29 | 0.71 | 0.27 | 20/20 | 0.00 | 0.00 |
| A* | 693 | 504 | 16.9% | 0.15 | 0.36 | 0.13 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 449 | 326 | 11.0% | 0.16 | 0.36 | 0.09 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 279 | 207 | 6.8% | 0.16 | 0.30 | 0.08 | 20/20 | 0.00 | 0.00 |
| SPFA | 2,010 | 1,815 | 49.1% | 0.24 | 0.51 | 0.18 | 20/20 | 0.00 | 0.00 |
| Greedy | 14 | 12 | 0.3% | 0.05 | 0.07 | 0.02 | 0/20 | 49.86 | 109.29 |

## N = 24  (V = 13,824, 20 reachable pairs, mean 29 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 7,806 | 9,082 | 56.5% | 2.20 | 3.11 | 0.99 | 20/20 | 0.00 | 0.00 |
| A* | 4,862 | 4,353 | 35.2% | 1.13 | 2.42 | 0.86 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 3,175 | 2,697 | 23.0% | 0.89 | 1.85 | 0.59 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 2,032 | 1,491 | 14.7% | 0.77 | 2.05 | 0.60 | 20/20 | 0.00 | 0.00 |
| SPFA | 14,457 | 16,012 | 104.6% | 1.82 | 2.64 | 0.89 | 20/20 | 0.00 | 0.00 |
| Greedy | 30 | 29 | 0.2% | 0.09 | 0.25 | 0.13 | 0/20 | 72.82 | 123.12 |

## N = 32  (V = 32,768, 20 reachable pairs, mean 38 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 18,976 | 20,495 | 57.9% | 5.10 | 7.18 | 2.05 | 20/20 | 0.00 | 0.00 |
| A* | 11,016 | 10,080 | 33.6% | 2.28 | 4.63 | 1.56 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 7,092 | 7,116 | 21.6% | 1.83 | 3.32 | 0.94 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 4,299 | 4,157 | 13.1% | 1.45 | 2.75 | 0.83 | 20/20 | 0.00 | 0.00 |
| SPFA | 37,031 | 36,600 | 113.0% | 4.18 | 5.95 | 1.78 | 20/20 | 0.00 | 0.00 |
| Greedy | 37 | 38 | 0.1% | 0.08 | 0.22 | 0.05 | 1/20 | 77.60 | 123.96 |

## N = 40  (V = 64,000, 20 reachable pairs, mean 45 hops on the optimal path)

| Algorithm | Expanded (mean) | Expanded (median) | Expanded / V | Time ms (median) | Time ms (p95) | Time sd | Optimal | Mean gap % | Max gap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dijkstra | 33,686 | 37,688 | 52.6% | 8.63 | 12.6 | 4.24 | 20/20 | 0.00 | 0.00 |
| A* | 19,539 | 19,361 | 30.5% | 4.46 | 9.86 | 2.96 | 20/20 | 0.00 | 0.00 |
| Bi-Dijkstra | 13,586 | 14,702 | 21.2% | 4.14 | 6.61 | 2.23 | 20/20 | 0.00 | 0.00 |
| Bi-A* | 8,227 | 8,693 | 12.9% | 3.29 | 5.13 | 1.80 | 20/20 | 0.00 | 0.00 |
| SPFA | 71,454 | 79,929 | 111.6% | 7.77 | 11.8 | 3.92 | 20/20 | 0.00 | 0.00 |
| Greedy | 44 | 47 | 0.1% | 0.15 | 0.38 | 0.07 | 0/20 | 73.77 | 105.70 |

## Empirical scaling, median time and mean expansions as a power of V

| Algorithm | alpha (expanded ~ V^alpha) | alpha (time ~ V^alpha) |
|---|---:|---:|
| Dijkstra | 1.03 | 1.06 |
| A* | 1.01 | 0.96 |
| Bi-Dijkstra | 1.00 | 0.70 |
| Bi-A* | 0.96 | 0.70 |
| SPFA | 1.15 | 1.09 |
| Greedy | 0.32 | 0.38 |

Times are single timed runs per pair (no repeats) after a JIT warm-up, so read medians, not single values.

wrote bench/results-6.json
