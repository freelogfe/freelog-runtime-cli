import { PolicyVisitor } from '../PolicyVisitor';
import { PolicyParser } from '../PolicyParser';
import { Policy, Audience, Declarations, State, Transition, Event } from './types';

export class PolicyVisitor extends PolicyVisitor<Policy> {
    private policy: Policy = {
        audiences: [],
        declarations: {
            serviceStates: [],
            expressions: [],
        },
        states: {},
    };

    visitPolicy(ctx: PolicyParser.PolicyContext): Policy {
        if (ctx.audience_section()) {
            this.visit(ctx.audience_section());
        }
        if (ctx.declaration_section()) {
            this.visit(ctx.declaration_section());
        }
        if (ctx.state_section()) {
            this.visit(ctx.state_section());
        }
        return this.policy;
    }

    visitAudience_section(ctx: PolicyParser.Audience_sectionContext): void {
        const audiences = ctx.audience();
        for (const audience of audiences) {
            const text = audience.getText();
            let type: 'public' | 'userId' | 'email' = 'userId';
            if (text === 'public') {
                type = 'public';
            } else if (text.includes('@')) {
                type = 'email';
            }
            this.policy.audiences.push({
                name: text === 'public' ? 'public' : text,
                type,
            });
        }
    }

    visitDeclaration_section(ctx: PolicyParser.Declaration_sectionContext): void {
        const declarations = ctx.declaration();
        for (const decl of declarations) {
            this.visit(decl);
        }
    }

    visitService_state_declaration(ctx: PolicyParser.Service_state_declarationContext): void {
        const name = ctx.ID().getText();
        this.policy.declarations.serviceStates.push({
            name,
            scope: 'always',
        });
    }

    visitState_section(ctx: PolicyParser.State_sectionContext): void {
        const states = ctx.state_definition();
        let isFirst = true;
        for (const state of states) {
            const stateDef = this.visit(state);
            if (isFirst) {
                stateDef.isInitial = true;
                isFirst = false;
            }
            this.policy.states[stateDef.name] = stateDef;
        }
    }

    visitState_definition(ctx: PolicyParser.State_definitionContext): State {
        const name = ctx.state_name().getText();
        const serviceStates: string[] = [];
        
        if (ctx.service_states()) {
            const ids = ctx.service_states()!.ID();
            for (const id of ids) {
                serviceStates.push(id.getText());
            }
        }

        const transitions: Transition[] = [];
        const transitionCtxs = ctx.transition();
        for (const transCtx of transitionCtxs) {
            if (transCtx.event()) {
                const event = this.visit(transCtx.event()!);
                const toState = transCtx.state_name()?.getText() || 'terminate';
                transitions.push({ event, toState });
            } else {
                transitions.push({ event: null as any, toState: 'terminate' });
            }
        }

        return {
            name,
            serviceStates,
            transitions,
        };
    }

    visitEvent(ctx: PolicyParser.EventContext): Event {
        const service = ctx.service().getText();
        const name = ctx.event_name().ID().getText();
        const args: Record<string, any> = {};

        if (ctx.event_args()) {
            const argCtxs = ctx.event_args()!.event_arg();
            let index = 0;
            for (const argCtx of argCtxs) {
                let value: any;
                if (argCtx.STRING()) {
                    const str = argCtx.STRING().getText();
                    value = str.slice(1, -1); // 移除引号
                } else if (argCtx.NUMBER()) {
                    value = parseFloat(argCtx.NUMBER().getText());
                } else if (argCtx.ID()) {
                    value = argCtx.ID().getText();
                }
                args[`arg${index++}`] = value;
            }
        }

        return { service, name, args };
    }
}
