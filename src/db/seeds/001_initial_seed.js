/**
 * Initial Seed Data: Problem Types, Problems (with C, C++, Java, Python starter code),
 * Test cases, genuine hints, and decoy hints.
 */
exports.seed = async function (knex) {
  // Clear tables in reverse dependency order
  await knex('submissions').del();
  await knex('served_problems').del();
  await knex('hint_options').del();
  await knex('hint_events').del();
  await knex('decoy_hints').del();
  await knex('problems').del();
  await knex('problem_types').del();

  // 1. Problem Types (Sequence Order defines stages)
  const [t1] = await knex('problem_types')
    .insert({ name: 'Arrays & Two Pointers', sequence_order: 1 })
    .returning('*');

  const [t2] = await knex('problem_types')
    .insert({ name: 'Hash Maps & Strings', sequence_order: 2, hints_per_stage: 2 })
    .returning('*');

  const [t3] = await knex('problem_types')
    .insert({ name: 'Dynamic Programming & Recursion', sequence_order: 3, hints_per_stage: 3 })
    .returning('*');

  // 2. Decoy Hints
  await knex('decoy_hints').insert([
    // Decoys for Stage 2 (Hash Maps & Strings)
    {
      type_id: t2.id,
      text: 'Sort the string characters in-place using bubble sort on ASCII values to compare frequency.',
    },
    {
      type_id: t2.id,
      text: 'Use a nested loop O(N^2) search over the array to verify each pair without extra memory allocation.',
    },
    {
      type_id: t2.id,
      text: 'Convert all characters to binary representations and XOR them sequentially.',
    },

    // Decoys for Stage 3 (Dynamic Programming)
    {
      type_id: t3.id,
      text: 'Recalculate all previous states using a brute force recursive call tree without memoization.',
    },
    {
      type_id: t3.id,
      text: 'Greedily take the largest immediate step at each position ignoring future constraints.',
    },
    {
      type_id: t3.id,
      text: 'Store the entire permutation tree in memory as an adjacency matrix graph.',
    },
    {
      type_id: t3.id,
      text: 'Use bitmask shifting across 64-bit integers assuming the inputs fit in a single register.',
    },
  ]);

  // 3. Problems
  // Problem 1 (Stage 1: Arrays - Cold solve)
  await knex('problems').insert({
    type_id: t1.id,
    title: 'Two Sum Difference',
    description:
      'Given an array of integers and a target difference k, return the indices (0-based) of the two numbers such that their absolute difference equals k. Return them as space-separated integers sorted ascending. Assume exactly one valid pair exists.',
    difficulty: 1,
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: JSON.stringify({
      python: `import sys

def solve():
    lines = sys.stdin.read().strip().split()
    if not lines:
        return
    k = int(lines[0])
    n = int(lines[1])
    arr = [int(x) for x in lines[2:2+n]]
    
    for i in range(n):
        for j in range(i + 1, n):
            if abs(arr[i] - arr[j]) == k:
                print(f"{i} {j}")
                return

if __name__ == "__main__":
    solve()
`,
      cpp: `#include <iostream>
#include <vector>
#include <cmath>

using namespace std;

int main() {
    int k, n;
    if (!(cin >> k >> n)) return 0;
    vector<int> arr(n);
    for (int i = 0; i < n; i++) cin >> arr[i];

    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (abs(arr[i] - arr[j]) == k) {
                cout << i << " " << j << endl;
                return 0;
            }
        }
    }
    return 0;
}
`,
      c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int k, n;
    if (scanf("%d %d", &k, &n) != 2) return 0;
    int *arr = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &arr[i]);

    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (abs(arr[i] - arr[j]) == k) {
                printf("%d %d\\n", i, j);
                free(arr);
                return 0;
            }
        }
    }
    free(arr);
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int k = sc.nextInt();
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = sc.nextInt();

        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (Math.abs(arr[i] - arr[j]) == k) {
                    System.out.println(i + " " + j);
                    return;
                }
            }
        }
    }
}
`,
    }),
    test_cases: JSON.stringify([
      { input: '3 4\n1 5 3 4', expected_output: '0 3', hidden: false },
      { input: '2 5\n10 20 12 30 40', expected_output: '0 2', hidden: false },
      { input: '5 3\n1 6 10', expected_output: '0 1', hidden: true },
    ]),
    hint_text:
      'Store each number in a hash map as you iterate to check if (num - k) or (num + k) already exists in O(1).',
  });

  // Problem 2 (Stage 2: Hash Maps & Strings)
  await knex('problems').insert({
    type_id: t2.id,
    title: 'First Non-Repeating Character',
    description:
      'Given a single lowercase string, find the index of the first non-repeating character. If none exists, output -1.',
    difficulty: 2,
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: JSON.stringify({
      python: `import sys

def solve():
    s = sys.stdin.read().strip()
    if not s:
        return
    counts = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            print(i)
            return
    print(-1)

if __name__ == "__main__":
    solve()
`,
      cpp: `#include <iostream>
#include <string>
#include <unordered_map>

using namespace std;

int main() {
    string s;
    if (!(cin >> s)) return 0;
    unordered_map<char, int> counts;
    for (char c : s) counts[c]++;
    for (int i = 0; i < (int)s.size(); i++) {
        if (counts[s[i]] == 1) {
            cout << i << endl;
            return 0;
        }
    }
    cout << -1 << endl;
    return 0;
}
`,
      c: `#include <stdio.h>
#include <string.h>

int main() {
    char s[100005];
    if (scanf("%s", s) != 1) return 0;
    int counts[26] = {0};
    int len = strlen(s);
    for (int i = 0; i < len; i++) counts[s[i] - 'a']++;
    for (int i = 0; i < len; i++) {
        if (counts[s[i] - 'a'] == 1) {
            printf("%d\\n", i);
            return 0;
        }
    }
    printf("-1\\n");
    return 0;
}
`,
      java: `import java.util.Scanner;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNext()) return;
        String s = sc.next();
        int[] counts = new int[26];
        for (int i = 0; i < s.length(); i++) counts[s.charAt(i) - 'a']++;
        for (int i = 0; i < s.length(); i++) {
            if (counts[s.charAt(i) - 'a'] == 1) {
                System.out.println(i);
                return;
            }
        }
        System.out.println(-1);
    }
}
`,
    }),
    test_cases: JSON.stringify([
      { input: 'leetcode', expected_output: '0', hidden: false },
      { input: 'loveleetcode', expected_output: '2', hidden: false },
      { input: 'aabb', expected_output: '-1', hidden: true },
    ]),
    hint_text:
      'Count frequencies in an array of size 26 or a hash map in a first pass, then do a second pass to identify the first character with count 1.',
  });

  // Problem 3 (Stage 3: Dynamic Programming)
  await knex('problems').insert({
    type_id: t3.id,
    title: 'Climbing Stairs Minimum Cost',
    description:
      'Given an integer array cost where cost[i] is the cost of step i on a staircase. Once you pay the cost, you can climb one or two steps. You can start from index 0 or index 1. Return the minimum cost to reach the top (past the last step).',
    difficulty: 3,
    time_limit_ms: 2000,
    memory_limit_mb: 128,
    starter_code: JSON.stringify({
      python: `import sys

def solve():
    lines = sys.stdin.read().strip().split()
    if not lines:
        return
    n = int(lines[0])
    cost = [int(x) for x in lines[1:1+n]]
    
    dp0, dp1 = 0, 0
    for c in cost:
        dp0, dp1 = dp1, min(dp0, dp1) + c
    print(min(dp0, dp1))

if __name__ == "__main__":
    solve()
`,
      cpp: `#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> cost(n);
    for (int i = 0; i < n; i++) cin >> cost[i];

    int prev2 = 0, prev1 = 0;
    for (int c : cost) {
        int curr = min(prev1, prev2) + c;
        prev2 = prev1;
        prev1 = curr;
    }
    cout << min(prev1, prev2) << endl;
    return 0;
}
`,
      c: `#include <stdio.h>
#include <stdlib.h>

#define MIN(a, b) ((a) < (b) ? (a) : (b))

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int prev2 = 0, prev1 = 0;
    for (int i = 0; i < n; i++) {
        int c;
        scanf("%d", &c);
        int curr = MIN(prev1, prev2) + c;
        prev2 = prev1;
        prev1 = curr;
    }
    printf("%d\\n", MIN(prev1, prev2));
    return 0;
}
`,
      java: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int prev2 = 0, prev1 = 0;
        for (int i = 0; i < n; i++) {
            int c = sc.nextInt();
            int curr = Math.min(prev1, prev2) + c;
            prev2 = prev1;
            prev1 = curr;
        }
        System.out.println(Math.min(prev1, prev2));
    }
}
`,
    }),
    test_cases: JSON.stringify([
      { input: '3\n10 15 20', expected_output: '15', hidden: false },
      { input: '10\n1 100 1 1 1 100 1 1 100 1', expected_output: '6', hidden: false },
    ]),
    hint_text:
      'Define dp[i] as the minimum cost to reach step i using recurrence dp[i] = cost[i] + min(dp[i-1], dp[i-2]) with O(1) auxiliary space.',
  });

  console.log('[Seed] Database successfully seeded with stages, problems, and decoy hints!');
};
