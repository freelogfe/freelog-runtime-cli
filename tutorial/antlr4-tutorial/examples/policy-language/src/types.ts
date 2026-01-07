export interface Policy {
    audiences: Audience[];
    declarations: Declarations;
    states: Record<string, State>;
}

export interface Audience {
    name: string;
    type: 'public' | 'userId' | 'email';
}

export interface Declarations {
    serviceStates: ServiceState[];
    expressions: Expression[];
}

export interface ServiceState {
    name: string;
    scope: 'always';
}

export interface Expression {
    name: string;
    args: string[];
    body: string;
}

export interface State {
    name: string;
    serviceStates: string[];
    transitions: Transition[];
    isInitial?: boolean;
}

export interface Transition {
    event: Event;
    toState: string | 'terminate';
}

export interface Event {
    service: string;
    name: string;
    args: Record<string, any>;
}
