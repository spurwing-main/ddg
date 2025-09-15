"use client";
import React from "react";
import * as _Builtin from "./_Builtin";
import * as _utils from "./utils";
import _styles from "./UtilityHero.module.css";

export function UtilityHero({
  as: _Component = _Builtin.Section,
  content = "",
}) {
  return (
    <_Component
      className={_utils.cx(_styles, "s-utility-hero")}
      grid={{
        type: "section",
      }}
      tag="div"
    >
      <_Builtin.Block className={_utils.cx(_styles, "container")} tag="div">
        <_Builtin.Block
          className={_utils.cx(_styles, "style-hero_content")}
          tag="div"
        >
          <_Builtin.RichText
            className={_utils.cx(_styles, "rich-text")}
            tag="div"
            slot=""
          >
            {content}
          </_Builtin.RichText>
        </_Builtin.Block>
      </_Builtin.Block>
    </_Component>
  );
}
