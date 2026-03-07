import React from "react";
import { render, screen } from "@testing-library/react";
import { FlowInspector } from "./FlowInspector";

test("node editor should hide layer and show system confidence helper copy", () => {
    render(
        <FlowInspector
            locale="zh-CN"
            node={{
                id: "n1",
                type: "belief",
                layer: "intent",
                statement: "意图：制定旅行计划",
                status: "confirmed",
                confidence: 0.84,
                importance: 0.8,
            }}
            edge={null}
            onPatchNode={() => {}}
            onPatchEdgeType={() => {}}
            onDeleteEdge={() => {}}
            onDeleteNode={() => {}}
        />
    );

    expect(screen.queryByText("Layer")).toBeNull();
    expect(screen.queryByText("层级")).toBeNull();
    expect(screen.getByText(/系统觉得这条信息有多靠谱/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看“系统觉得这条信息有多靠谱”的说明/i })).toBeInTheDocument();
    expect(screen.getByText(/你可以把它理解成：系统有多相信你刚刚这句话/)).toBeInTheDocument();
});

test("edge editor should use user-facing relationship labels and expose delete action", () => {
    render(
        <FlowInspector
            locale="zh-CN"
            node={null}
            edge={{
                id: "e1",
                from: "n1",
                to: "n2",
                type: "enable",
                confidence: 0.72,
            }}
            onPatchNode={() => {}}
            onPatchEdgeType={() => {}}
            onDeleteEdge={() => {}}
            onDeleteNode={() => {}}
        />
    );

    expect(screen.getByRole("button", { name: "删除关系" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "支持" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "限制" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "决定" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "冲突" })).toBeInTheDocument();
});
