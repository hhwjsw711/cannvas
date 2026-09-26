import assert from "node:assert/strict";
import test from "node:test";
import { calculateSunTimes, DEEPEST_DIM, nightDimLevel, sunTimesFromNext } from "../src/lib/nightDim.ts";

// These tests use China Standard Time, like the Lishui kiosk.
process.env.TZ = "Asia/Shanghai";
const at = (value) => new Date(`${value}+08:00`);
const minutes = (date) => date.getHours() * 60 + date.getMinutes();

test("calculates Lishui sunrise and sunset", () => {
  const spring = calculateSunTimes(at("2026-09-25T09:00:00"));
  // NOAA-style reference for Lishui on 25 Sep 2026: about 05:49 and 17:55 CST.
  assert.ok(Math.abs(minutes(spring.sunrise) - (5 * 60 + 49)) <= 6, spring.sunrise.toString());
  assert.ok(Math.abs(minutes(spring.sunset) - (17 * 60 + 55)) <= 6, spring.sunset.toString());

  const summer = calculateSunTimes(at("2026-06-21T23:00:00"));
  assert.ok(minutes(summer.sunrise) > 5 * 60 && minutes(summer.sunrise) < 5 * 60 + 30, summer.sunrise.toString());
  assert.ok(minutes(summer.sunset) > 19 * 60 && minutes(summer.sunset) < 19 * 60 + 30, summer.sunset.toString());
});

test("uses Home Assistant's next times, shifted back once they are tomorrow's", () => {
  const now = at("2026-09-25T19:00:00");
  const sun = sunTimesFromNext(now, at("2026-09-26T05:52:00"), at("2026-09-26T18:02:00"));
  assert.equal(sun.sunrise.toISOString(), at("2026-09-25T05:52:00").toISOString());
  assert.equal(sun.sunset.toISOString(), at("2026-09-25T18:02:00").toISOString());

  // In daylight, Home Assistant already reports tomorrow's sunrise but today's sunset.
  const midday = sunTimesFromNext(at("2026-09-25T12:00:00"), at("2026-09-26T05:52:00"), at("2026-09-25T18:01:00"));
  assert.equal(midday.sunrise.toISOString(), at("2026-09-25T05:52:00").toISOString());
  assert.equal(midday.sunset.toISOString(), at("2026-09-25T18:01:00").toISOString());

  const morning = at("2026-09-25T05:30:00");
  const early = sunTimesFromNext(morning, at("2026-09-25T05:53:00"), at("2026-09-25T18:01:00"));
  assert.equal(early.sunrise.toISOString(), at("2026-09-25T05:53:00").toISOString());
});

test("does not dim in daylight", () => {
  const sun = { sunrise: at("2026-09-25T05:53:00"), sunset: at("2026-09-25T18:01:00") };
  assert.equal(nightDimLevel(at("2026-09-25T07:00:00"), sun), 0);
  assert.equal(nightDimLevel(at("2026-09-25T18:00:00"), sun), 0);
});

test("dims gradually from sunset to the deepest level at 21:00", () => {
  const sun = { sunrise: at("2026-09-25T05:53:00"), sunset: at("2026-09-25T18:00:00") };
  assert.equal(nightDimLevel(at("2026-09-25T18:00:00"), sun), 0);
  assert.equal(nightDimLevel(at("2026-09-25T19:30:00"), sun), Math.round(DEEPEST_DIM * 500) / 1000);
  assert.equal(nightDimLevel(at("2026-09-25T21:00:00"), sun), DEEPEST_DIM);
  assert.equal(nightDimLevel(at("2026-09-25T21:10:00"), sun), DEEPEST_DIM);
});

test("stays dim before sunrise and undims at sunrise", () => {
  const sun = { sunrise: at("2026-06-22T05:03:00"), sunset: at("2026-06-22T19:00:00") };
  assert.equal(nightDimLevel(at("2026-06-22T04:50:00"), sun), DEEPEST_DIM);
  assert.equal(nightDimLevel(at("2026-06-22T05:03:00"), sun), 0);
});