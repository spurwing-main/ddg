"use client";
import React from "react";
import * as _Builtin from "./_Builtin";
import * as _interactions from "./interactions";
import * as _utils from "./utils";
import _styles from "./Nav.module.css";

const _interactionsData = JSON.parse(
  '{"events":{"e":{"id":"e","name":"","animationType":"custom","eventTypeId":"MOUSE_CLICK","action":{"id":"","actionTypeId":"GENERAL_START_ACTION","config":{"delay":0,"easing":"","duration":0,"actionListId":"a","affectedElements":{},"playInReverse":false,"autoStopEventId":"e-2"}},"mediaQueries":["medium","small","tiny"],"target":{"selector":".nav_mobile-btn","originalId":"bdafb7b4-0bce-c2af-33dc-cafe0d921f85","appliesTo":"CLASS"},"targets":[{"selector":".nav_mobile-btn","originalId":"bdafb7b4-0bce-c2af-33dc-cafe0d921f85","appliesTo":"CLASS"}],"config":{"loop":false,"playInReverse":false,"scrollOffsetValue":null,"scrollOffsetUnit":null,"delay":null,"direction":null,"effectIn":null},"createdOn":1736501937027},"e-2":{"id":"e-2","name":"","animationType":"custom","eventTypeId":"MOUSE_SECOND_CLICK","action":{"id":"","actionTypeId":"GENERAL_START_ACTION","config":{"delay":0,"easing":"","duration":0,"actionListId":"a-2","affectedElements":{},"playInReverse":false,"autoStopEventId":"e"}},"mediaQueries":["medium","small","tiny"],"target":{"selector":".nav_mobile-btn","originalId":"bdafb7b4-0bce-c2af-33dc-cafe0d921f85","appliesTo":"CLASS"},"targets":[{"selector":".nav_mobile-btn","originalId":"bdafb7b4-0bce-c2af-33dc-cafe0d921f85","appliesTo":"CLASS"}],"config":{"loop":false,"playInReverse":false,"scrollOffsetValue":null,"scrollOffsetUnit":null,"delay":null,"direction":null,"effectIn":null},"createdOn":1736501937028}},"actionLists":{"a":{"id":"a","title":"Nav Mobile Icon [OPEN]","actionItemGroups":[{"actionItems":[{"id":"a-n-4","actionTypeId":"TRANSFORM_SCALE","config":{"delay":0,"easing":"inQuart","duration":100,"target":{"selector":".nav_mobile-btn-svg.is-open","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","20611448-72eb-2670-4726-615ff75de3d1"]},"xValue":0.75,"yValue":0.75,"locked":true}},{"id":"a-n-3","actionTypeId":"STYLE_OPACITY","config":{"delay":50,"easing":"inQuart","duration":100,"target":{"selector":".nav_mobile-btn-svg.is-open","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","20611448-72eb-2670-4726-615ff75de3d1"]},"value":0,"unit":""}}]},{"actionItems":[{"id":"a-n-2","actionTypeId":"STYLE_OPACITY","config":{"delay":0,"easing":"outQuart","duration":100,"target":{"selector":".nav_mobile-btn-svg.is-close","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","8f5ddd77-ed8f-b0fb-e007-df9631813a57"]},"value":1,"unit":""}},{"id":"a-n","actionTypeId":"TRANSFORM_SCALE","config":{"delay":50,"easing":"outQuart","duration":100,"target":{"selector":".nav_mobile-btn-svg.is-close","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","8f5ddd77-ed8f-b0fb-e007-df9631813a57"]},"xValue":1,"yValue":1,"locked":true}}]}],"useFirstGroupAsInitialState":false,"createdOn":1736501900600},"a-2":{"id":"a-2","title":"Nav Mobile Icon [CLOSE]","actionItemGroups":[{"actionItems":[{"id":"a-2-n","actionTypeId":"TRANSFORM_SCALE","config":{"delay":0,"easing":"inQuart","duration":100,"target":{"useEventTarget":"CHILDREN","selector":".nav_mobile-btn-svg.is-close","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","8f5ddd77-ed8f-b0fb-e007-df9631813a57"]},"xValue":0.75,"yValue":0.75,"locked":true}},{"id":"a-2-n-2","actionTypeId":"STYLE_OPACITY","config":{"delay":50,"easing":"inQuart","duration":100,"target":{"useEventTarget":"CHILDREN","selector":".nav_mobile-btn-svg.is-close","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","8f5ddd77-ed8f-b0fb-e007-df9631813a57"]},"value":0,"unit":""}}]},{"actionItems":[{"id":"a-2-n-3","actionTypeId":"STYLE_OPACITY","config":{"delay":0,"easing":"outQuart","duration":100,"target":{"useEventTarget":"CHILDREN","selector":".nav_mobile-btn-svg.is-open","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","20611448-72eb-2670-4726-615ff75de3d1"]},"value":1,"unit":""}},{"id":"a-2-n-4","actionTypeId":"TRANSFORM_SCALE","config":{"delay":50,"easing":"outQuart","duration":100,"target":{"useEventTarget":"CHILDREN","selector":".nav_mobile-btn-svg.is-open","selectorGuids":["8f5ddd77-ed8f-b0fb-e007-df9631813a55","20611448-72eb-2670-4726-615ff75de3d1"]},"xValue":1,"yValue":1,"locked":true}}]}],"useFirstGroupAsInitialState":false,"createdOn":1736501900600}},"site":{"mediaQueries":[{"key":"main","min":992,"max":10000},{"key":"medium","min":768,"max":991},{"key":"small","min":480,"max":767},{"key":"tiny","min":0,"max":479}]}}'
);

export function Nav({ as: _Component = _Builtin.Block }) {
  _interactions.useInteractions(_interactionsData, _styles);

  return (
    <_Component className={_utils.cx(_styles, "nav")} tag="nav">
      <_Builtin.Block className={_utils.cx(_styles, "container")} tag="div">
        <_Builtin.Block className={_utils.cx(_styles, "nav_layout")} tag="div">
          <_Builtin.Link
            className={_utils.cx(_styles, "nav_logo-link")}
            button={false}
            block="inline"
            options={{
              href: "#",
            }}
          >
            <_Builtin.HtmlEmbed
              className={_utils.cx(_styles, "nav_logo")}
              value="%3Csvg%20viewBox%3D%220%200%20300%2043%22%20fill%3D%22currentColor%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M16.1035%2043C7.48303%2043%200.658507%2037.7605%200%2030.112L8.20141%2028.3655C8.68032%2033.5448%2012.1524%2036.3754%2017.0015%2036.3754C20.7729%2036.3754%2024.6042%2034.388%2024.6042%2030.4132C24.6042%2027.8838%2022.7484%2026.6793%2019.5158%2025.4748L12.6912%2022.9454C7.5429%2021.0182%204.1905%2018.9104%204.1905%2013.4902C4.1905%205.60084%2011.8531%200%2021.0124%200C30.1117%200%2035.1403%205.29972%2035.9784%2011.2619L27.777%2012.9482C27.0587%209.21429%2024.4845%206.62465%2019.4559%206.62465C15.5048%206.62465%2012.6314%208.97339%2012.6314%2011.8039C12.6314%2014.1527%2014.7266%2015.2367%2017.6001%2016.2605L24.4845%2018.7899C29.2138%2020.4762%2032.9852%2023.3067%2032.9852%2028.6667C32.9852%2037.3389%2025.5022%2043%2016.1035%2043Z%22%2F%3E%0A%3Cpath%20d%3D%22M34.5323%2042.5784L41.8956%200.421567H56.4427C65.7216%200.421567%2071.289%204.63725%2071.289%2011.6233C71.289%2021.0784%2063.7461%2028.3655%2052.7311%2028.3655H45.4276L42.9732%2042.5784H34.5323ZM46.6249%2021.7409H52.4916C58.2985%2021.7409%2062.4889%2018.2479%2062.4889%2012.9482C62.4889%209.21429%2059.7352%207.04622%2055.0658%207.04622H49.1991L46.6249%2021.7409Z%22%2F%3E%0A%3Cpath%20d%3D%22M87.1268%2043C75.8723%2043%2070.1852%2036.6765%2071.9812%2026.2577L76.471%200.421567H84.9119L80.422%2026.1373C79.2846%2032.7619%2082.3377%2035.9538%2088.3241%2035.9538C94.3704%2035.9538%2098.6208%2032.6415%2099.7582%2026.1373L104.248%200.421567H112.509L107.96%2026.2577C106.164%2036.6765%2098.2616%2043%2087.1268%2043Z%22%2F%3E%0A%3Cpath%20d%3D%22M110.827%2042.5784L118.19%200.421567H133.695C142.315%200.421567%20147.883%204.33613%20147.883%2010.8403C147.883%2017.5854%20143.453%2023.3067%20136.867%2025.1134L144.59%2042.5784H136.209L129.744%2027.402H121.901L119.267%2042.5784H110.827ZM123.099%2020.7773H129.504C135.131%2020.7773%20139.023%2017.5854%20139.023%2012.4062C139.023%209.03361%20136.628%207.04622%20131.48%207.04622H125.493L123.099%2020.7773Z%22%2F%3E%0A%3Cpath%20d%3D%22M154.238%2042.5784L151.065%200.421567H159.207L161.482%2030.1723L175.49%200.421567H183.093L186.924%2029.6303L199.136%200.421567H207.338L189.678%2042.5784H181.297L177.226%2011.8039L162.679%2042.5784H154.238Z%22%2F%3E%0A%3Cpath%20d%3D%22M202.788%2042.5784L210.152%200.421567H218.593L211.229%2042.5784H202.788Z%22%2F%3E%0A%3Cpath%20d%3D%22M217.025%2042.5784L224.388%200.421567H233.428L246.598%2029.2689L251.626%200.421567H259.648L252.285%2042.5784H244.143L230.315%2012.2255L224.987%2042.5784H217.025Z%22%2F%3E%0A%3Cpath%20d%3D%22M275.336%2043C266.057%2043%20259.352%2036.556%20259.352%2026.619C259.352%2012.7675%20269.469%200%20283.896%200C294.612%200%20299.581%206.68487%20300%2013.3095L291.499%2015.1765C290.721%2010.5994%20288.147%207.04622%20282.46%207.04622C273.48%207.04622%20268.212%2016.381%20268.212%2024.993C268.212%2031.8585%20272.163%2035.9538%20278.269%2035.9538C283.777%2035.9538%20288.925%2032.1597%20291.02%2026.2577H282.22L283.896%2019.874H299.94L295.989%2042.5784H289.584L291.08%2034.2675C287.428%2039.5672%20281.502%2043%20275.336%2043Z%22%2F%3E%0A%3C%2Fsvg%3E"
            />
          </_Builtin.Link>
          <_Builtin.Block className={_utils.cx(_styles, "nav_menu")} tag="div">
            <_Builtin.Link
              className={_utils.cx(_styles, "nav_menu-link")}
              button={false}
              block=""
              options={{
                href: "#",
              }}
            >
              {"Nav Link 1"}
            </_Builtin.Link>
            <_Builtin.Link
              className={_utils.cx(_styles, "nav_menu-link")}
              button={false}
              block=""
              options={{
                href: "#",
              }}
            >
              {"Nav Link 2"}
            </_Builtin.Link>
            <_Builtin.Link
              className={_utils.cx(_styles, "nav_menu-link")}
              button={false}
              block=""
              options={{
                href: "#",
              }}
            >
              {"Nav Link 3"}
            </_Builtin.Link>
            <_Builtin.Link
              className={_utils.cx(_styles, "nav_menu-link")}
              button={false}
              block=""
              options={{
                href: "#",
              }}
            >
              {"Nav Link 4"}
            </_Builtin.Link>
            <_Builtin.Link
              className={_utils.cx(_styles, "nav_menu-link")}
              button={false}
              block=""
              options={{
                href: "#",
              }}
            >
              {"Nav Link 5"}
            </_Builtin.Link>
          </_Builtin.Block>
          <_Builtin.DOM
            className={_utils.cx(_styles, "nav_mobile-btn")}
            tag="button"
            slot=""
          >
            <_Builtin.HtmlEmbed
              className={_utils.cx(_styles, "nav_mobile-btn-svg", "is-close")}
              value="%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%2012%2012%22%20fill%3D%22none%22%20preserveAspectRatio%3D%22xMidYMid%20meet%22%20aria-hidden%3D%22true%22%20role%3D%22img%22%3E%0A%3Cpath%20d%3D%22M1.2%2012L0%2010.8L4.8%206L0%201.2L1.2%200L6%204.8L10.8%200L12%201.2L7.2%206L12%2010.8L10.8%2012L6%207.2L1.2%2012Z%22%20fill%3D%22currentColor%22%2F%3E%0A%3C%2Fsvg%3E"
            />
            <_Builtin.HtmlEmbed
              className={_utils.cx(_styles, "nav_mobile-btn-svg", "is-open")}
              value="%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%25%22%20height%3D%22100%25%22%20viewBox%3D%220%200%2013%2010%22%20fill%3D%22none%22%20preserveAspectRatio%3D%22xMidYMid%20meet%22%20aria-hidden%3D%22true%22%20role%3D%22img%22%3E%0A%3Cpath%20d%3D%22M0%2010V8.33333H13V10H0ZM0%205.83333V4.16667H13V5.83333H0ZM0%201.66667V0H13V1.66667H0Z%22%20fill%3D%22currentColor%22%2F%3E%0A%3C%2Fsvg%3E"
            />
          </_Builtin.DOM>
        </_Builtin.Block>
      </_Builtin.Block>
    </_Component>
  );
}
