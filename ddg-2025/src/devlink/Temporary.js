"use client";
import React from "react";
import * as _Builtin from "./_Builtin";
import * as _utils from "./utils";
import _styles from "./Temporary.module.css";

export function Temporary({
  as: _Component = _Builtin.Section,
  tagline = "Component in development",
  title = "Component Name Goes Here",
}) {
  return (
    <_Component
      className={_utils.cx(_styles, "s-temporary")}
      grid={{
        type: "section",
      }}
      tag="section"
    >
      <_Builtin.Block className={_utils.cx(_styles, "container")} tag="div">
        <_Builtin.Block
          className={_utils.cx(_styles, "temporary_layout")}
          tag="div"
        >
          <_Builtin.Block tag="div">{tagline}</_Builtin.Block>
          <_Builtin.Block
            className={_utils.cx(_styles, "temporary_title")}
            tag="div"
          >
            {title}
          </_Builtin.Block>
        </_Builtin.Block>
      </_Builtin.Block>
    </_Component>
  );
}
