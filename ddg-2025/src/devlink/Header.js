"use client";
import React from "react";
import * as _Builtin from "./_Builtin";
import { GlobalStyles } from "./GlobalStyles";
import { Nav } from "./Nav";
import { CookieBanner } from "./CookieBanner";

export function Header({ as: _Component = _Builtin.Block }) {
  return (
    <_Component tag="header">
      <GlobalStyles />
      <Nav />
      <CookieBanner />
    </_Component>
  );
}
