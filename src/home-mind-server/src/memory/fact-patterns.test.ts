import { describe, it, expect } from "vitest";
import { matchesGarbagePattern, filterFacts } from "./fact-patterns.js";

describe("memory meta-facts (tombstones)", () => {
  // All three of these were observed in a real user's memory after using forget_memory.
  it("drops a tombstone left behind by forgetting", () => {
    expect(
      matchesGarbagePattern(
        "You previously asked me not to retain your test canary word, and I do not retain it."
      )
    ).toMatch(/meta-fact/);
  });

  it("drops 'no longer wants X remembered'", () => {
    expect(
      matchesGarbagePattern("User no longer wants their test canary word remembered")
    ).toMatch(/meta-fact/);
  });

  it("drops a record of a confirmed deletion", () => {
    expect(
      matchesGarbagePattern(
        "You confirmed deletion of the bedroom cooling automation that ran at 20:00 when the temperature exceeded 22°C."
      )
    ).toMatch(/meta-fact/);
  });

  it("drops a record of what the user asked to forget", () => {
    expect(
      matchesGarbagePattern("User asked me to forget their preferred bedroom temperature")
    ).toMatch(/meta-fact/);
  });

  it("drops a record of the assistant deleting a memory", () => {
    expect(matchesGarbagePattern("The assistant deleted the memory about the canary word")).toMatch(
      /meta-fact/
    );
  });
});

describe("real facts survive the meta-fact filter", () => {
  // Taken verbatim from a real memory store — this is the regression set that keeps
  // the pattern honest, because MemoryCleanupJob applies it retroactively to
  // everything already stored. A false positive here deletes a real memory.
  const realFacts = [
    "User prefers the bedroom at 18°C.",
    "User wants the bathroom fan to run for 15 minutes when presence is detected.",
    "User wants the kitchen lights to turn on daily at 19:00.",
    "User wants the kitchen LED strip to turn on together with the TV lights.",
    "For evening ambient lighting, user prefers the living room at 20% brightness and the kitchen LED strip at 15%, triggered 30 minutes before sunset.",
    "A VOC reading of 100 and a NOx reading of 100 are normal for this home.",
    "For the bedroom, PM1.0, PM2.5, PM4.0 and PM10 readings of about 1 µg/m³ are normal.",
    "Burning incense can explain elevated particulate matter.",
    "User prefers cooling to 20°C between 20:00 and 22:00 when the bedroom exceeds 22°C, while home.",
    "User prefers 24-hour time.",
    "User's name is Alex",
    "User asked to be called Lexi",
  ];

  it.each(realFacts)("keeps: %s", (fact) => {
    expect(matchesGarbagePattern(fact)).toBeNull();
  });

  it("keeps a genuine fact phrased as a request to remember", () => {
    // The pattern must not fire on positive remember/retain — only on negated forms.
    expect(
      matchesGarbagePattern("User asked me to remember that 100 ppm is normal for their NOx sensor")
    ).toBeNull();
  });

  it("keeps a reminder, which is not a deletion", () => {
    expect(matchesGarbagePattern("User wants to be reminded to water the plants")).toBeNull();
  });

  it("keeps a fact that merely contains 'not'", () => {
    expect(
      matchesGarbagePattern(
        "The air conditioner's climate mode does not prove it is physically running."
      )
    ).toBeNull();
  });
});

describe("filterFacts", () => {
  it("separates tombstones from real facts", () => {
    const { kept, skipped } = filterFacts([
      { content: "User prefers the bedroom at 18°C." },
      { content: "User no longer wants their canary word remembered" },
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].content).toContain("18°C");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/meta-fact/);
  });
});
