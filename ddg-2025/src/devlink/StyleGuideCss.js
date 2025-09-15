"use client";
import React from "react";
import * as _Builtin from "./_Builtin";
import * as _utils from "./utils";
import _styles from "./StyleGuideCss.module.css";

export function StyleGuideCss({ as: _Component = _Builtin.HtmlEmbed }) {
  return (
    <_Component
      className={_utils.cx(_styles, "css-style-guide")}
      value="%3Cstyle%3E%0A%20%20%2F*%20add%20labels%20to%20elements%20in%20style%20guide%20*%2F%0A%20%20.style-list%20%3E%20*%3Abefore%20%7B%0A%20%20%20%20content%3A%20%22.%22%20attr(class)%3B%0A%20%20%20%20display%3A%20block%3B%0A%20%20%20%20position%3A%20absolute%3B%0A%20%20%20%20left%3A%200%25%3B%0A%20%20%20%20top%3A%200%25%3B%0A%20%20%20%20right%3A%20auto%3B%0A%20%20%20%20bottom%3A%20auto%3B%0A%20%20%20%20padding-top%3A%200.25rem%3B%0A%20%20%20%20padding-right%3A%200.25rem%3B%0A%20%20%20%20padding-bottom%3A%200.25rem%3B%0A%20%20%20%20padding-left%3A%200.25rem%3B%0A%20%20%20%20background-color%3A%20hsla(59%2C%20100%25%2C%2078.57%25%2C%201)%3B%0A%20%20%20%20color%3A%20hsla(0%2C%200%25%2C%200%25%2C%201)%3B%0A%20%20%20%20font-size%3A%200.5rem%3B%0A%20%20%20%20line-height%3A%201%3B%0A%20%20%20%20letter-spacing%3A%200.125rem%3B%0A%20%20%20%20text-transform%3A%20uppercase%3B%0A%20%20%20%20z-index%3A%20100%3B%0A%20%20%7D%0A%20%20.style-list%20%3E%20*%20%7B%0A%20%20%20%20min-height%3A%205rem%3B%0A%20%20%20%20width%3A%20100%25%3B%0A%20%20%20%20outline%3A%201px%20solid%20black%20!important%3B%0A%20%20%20%20outline-offset%3A%200px%20!important%3B%0A%20%20%20%20box-shadow%3A%20none%3B%0A%20%20%20%20padding%3A%201rem%3B%0A%20%20%20%20font-size%3A%20inherit%3B%0A%20%20%20%20line-height%3A%20normal%3B%0A%20%20%20%20position%3A%20relative%3B%0A%20%20%20%20overflow%3A%20hidden%3B%0A%20%20%7D%0A%0A%3C%2Fstyle%3E"
    />
  );
}
